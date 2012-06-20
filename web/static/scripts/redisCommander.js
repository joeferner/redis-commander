'use strict';

function resizeTree() {
  $('#keyTree').height($(window).height() - 100);
}

function loadTree() {
  $('#keyTree').bind("loaded.jstree", function() {
    var root = getKeyTree()._get_children(-1)[0];
    getKeyTree().open_node(root, null, true);
  });

  $('#keyTree').jstree({
    json_data: {
      data: {
        data: "Root",
        state: "closed",
        attr: {
          id: "root",
          rel: "root"
        }
      },
      ajax: {
        url: function (node) {
          if (node !== -1) {
            var path = $.jstree._focused().get_path(node, true).slice(1).join(':');
            return '/apiv1/keys/' + path;
          }
          return '/apiv1/keys';
        }
      }
    },
    types: {
      types: {
        "root": {
          icon: {
            image: '/images/treeRoot.png'
          }
        },
        "string": {
          icon: {
            image: '/images/treeString.png'
          }
        },
        "hash": {
          icon: {
            image: '/images/treeHash.png'
          }
        },
        "set": {
          icon: {
            image: '/images/treeSet.png'
          }
        },
        "list": {
          icon: {
            image: '/images/treeList.png'
          }
        },
        "zset": {
          icon: {
            image: '/images/treeZSet.png'
          }
        }
      }
    },
    plugins: [ "themes", "json_data", "types", "ui" ]
  })
    .bind("select_node.jstree", treeNodeSelected)
    .delegate("a", "click", function (event, data) { event.preventDefault(); });
}

function treeNodeSelected(event, data) {
  $('#body').html('Loading...');
  var pathParts = getKeyTree().get_path(data.rslt.obj, true);
  if (pathParts.length === 1) {
    $.get('/apiv1/server/info', function (data, status) {
      if (status != 'success') {
        return alert("Could not load server info");
      }

      data = JSON.parse(data);
      var html = new EJS({ url: '/templates/serverInfo.ejs' }).render(data);
      $('#body').html(html);
    });
  } else {
    var path = pathParts.slice(1).join(':');
    $.get('/apiv1/key/' + path, function (data, status) {
      if (status != 'success') {
        return alert("Could not load key data");
      }

      data = JSON.parse(data);
      console.log("rendering type " + data.type);
      switch (data.type) {
      case 'string':
        selectTreeNodeString(data);
        break;
      case 'hash':
        selectTreeNodeHash(data);
        break;
      case 'set':
        selectTreeNodeSet(data);
        break;
      case 'list':
        selectTreeNodeList(data);
        break;
      case 'zset':
        selectTreeNodeZSet(data);
        break;
      case 'none':
        selectTreeNodeBranch(data);
        break;
      default:
        var html = JSON.stringify(data);
        $('#body').html(html);
        break;
      }
    });
  }
}

function selectTreeNodeBranch(data) {
  var html = new EJS({ url: '/templates/editBranch.ejs' }).render(data);
  $('#body').html(html);
  $('#keyValue').keyup(function() {
    var action = "/apiv1/key/" + $(this).val();
    $('#addKeyForm').attr("action", action);
  });
  $('#addKeyForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#saveKeyButton').attr("disabled", "disabled");
      $('#saveKeyButton').html("<i class='icon-refresh'></i> Saving");
    },
    error: function (err) {
      console.log('save error', arguments);
      alert("Could not save '" + err.statusText + "'");
      saveComplete();
    },
    success: function () {
      console.log('saved', arguments);
      saveComplete();
    }
  });

  function saveComplete() {
    setTimeout(function () {
      $('#saveKeyButton').html("Save");
      $('#saveKeyButton').removeAttr("disabled");
      refreshTree();
      $('#addKeyModal').modal('hide');
    }, 500);
  }
}

function selectTreeNodeString(data) {
  var html = new EJS({ url: '/templates/editString.ejs' }).render(data);
  $('#body').html(html);

  try {
    data.value = JSON.stringify(JSON.parse(data.value), null, '  ');
    $('#isJson').val('true');
  } catch (ex) {
    $('#isJson').val('false');
  }

  $('#stringValue').val(data.value);
  $('#stringValue').keyup(function() {
    $('#stringValueClippy').clippy({'text': $(this).val(), clippy_path: "/clippy-jquery/clippy.swf"});
  }).keyup();
  $('.clippyWrapper').tooltip();
  $('#editStringForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#saveKeyButton').attr("disabled", "disabled");
      $('#saveKeyButton').html("<i class='icon-refresh'></i> Saving");
    },
    error: function (err) {
      console.log('save error', arguments);
      alert("Could not save '" + err.statusText + "'");
      saveComplete();
    },
    success: function () {
      console.log('saved', arguments);
      saveComplete();
    }
  });

  function saveComplete() {
    setTimeout(function () {
      $('#saveKeyButton').html("Save");
      $('#saveKeyButton').removeAttr("disabled");
    }, 500);
  }
}

function selectTreeNodeHash(data) {
  var html = new EJS({ url: '/templates/editHash.ejs' }).render(data);
  $('#body').html(html);
}

function selectTreeNodeSet(data) {
  var html = new EJS({ url: '/templates/editSet.ejs' }).render(data);
  $('#body').html(html);
}

function selectTreeNodeList(data) {
  var html = new EJS({ url: '/templates/editList.ejs' }).render(data);
  $('#body').html(html);
}

function selectTreeNodeZSet(data) {
  var html = new EJS({ url: '/templates/editZSet.ejs' }).render(data);
  $('#body').html(html);
}

function getKeyTree() {
  return $.jstree._reference('#keyTree');
}

function refreshTree() {
  getKeyTree().refresh();
}

function deleteKey(key) {
  var result = confirm('Are you sure you want to delete "' + key + '"?');
  if (result) {
    $.post('/apiv1/key/' + key + '?action=delete', function (data, status) {
      if (status != 'success') {
        return alert("Could not delete key");
      }

      refreshTree();
      getKeyTree().select_node(-1);
      $('#body').html('');
    });
  }
}

function deleteBranch(branchPrefix) {
  var query = branchPrefix + ':*';
  var result = confirm('Are you sure you want to delete "' + query + '"? This will delete all children as well!');
  if (result) {
    $.post('/apiv1/keys/' + query + '?action=delete', function (data, status) {
      if (status != 'success') {
        return alert("Could not delete branch");
      }

      refreshTree();
      getKeyTree().select_node(-1);
      $('#body').html('');
    });
  }
}
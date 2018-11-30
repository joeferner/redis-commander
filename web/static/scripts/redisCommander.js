'use strict';

var CmdParser = require('cmdparser');
function loadTree () {
  $.get('apiv2/connection', function (isConnected) {
    if (isConnected) {
      $('#keyTree').bind("loaded.jstree", function () {
        var tree = getKeyTree();
        if (tree) {
          var root = tree.get_container().children("ul:eq(0)").children("li");
          tree.open_node(root, null, true);
        }
      });
      getServerInfo(function (data) {
        var json_dataData = [];

        data.forEach(function (instance, index) {
          // build root objects for jsontree
          var treeObj = {
            id: instance.host + ":" + instance.port + ":" + instance.db,
            text: instance.label + " (" + instance.host + ":" + instance.port + ":" + instance.db + ")",
            state: { opened: false },
            icon: getIconForType('root'),
            children: true,
            rel: "root"
          };
          json_dataData.push(treeObj);

          if (index === data.length - 1) {
            return onJSONDataComplete();
          }
        });
        function getJsonTreeData(node, cb) {
          if (node.id === '#') return cb(json_dataData);

          var dataUrl;
          if (node.parent === '#') {
              dataUrl = 'apiv2/keystree/' + encodeURIComponent(node.id) + '/';
          }
          else {
              var root = getRootConnection(node);
              var path = getFullKeyPath(node);
              dataUrl = 'apiv2/keystree/' + encodeURIComponent(root) + '/' + encodeURIComponent(path) + '?absolute=false';
          }
          $.get({
              url: dataUrl,
              dataType: 'json'
          }).done(function(nodeData) {
            if (Array.isArray(nodeData)) {
              nodeData.forEach(function(elem) {
                 if (elem.rel) elem.icon = getIconForType(elem.rel);
              });
            }
            cb(nodeData)
          }).fail(function(error) {
            console.log('Error fetching data for node ' + node.id + ': ' + JSON.stringify(error));
            cb('Error fetching data');
          });
        }

        function getIconForType(type) {
          switch (type) {
              case 'root': return 'images/treeRoot.png';
              case 'string': return 'images/treeString.png';
              case 'hash': return 'images/treeHash.png';
              case 'set': return 'images/treeSet.png';
              case 'list': return 'images/treeList.png';
              case 'zset': return 'images/treeZSet.png';
              default: return null;
          }
        }

        function onJSONDataComplete () {
          $('#keyTree').jstree({
              core: {
                  data: getJsonTreeData,
                  multiple : false,
                  check_callback : true,
                  //themes: {
                  //    responsive: true
                  //}
              },
              contextmenu: {
                  items: function (node) {
                      var menu = {
                          "addKey": {
                              icon: './images/icon-plus.png',
                              label: "Add Key",
                              action: addKey
                          },
                          "refresh": {
                              icon: './images/icon-refresh.png',
                              label: "Refresh",
                              action: function (obj) {
                                  jQuery.jstree.reference("#keyTree").refresh(obj);
                              }
                          },
                          "remKey": {
                              icon: './images/icon-trash.png',
                              label: 'Remove Key',
                              action: deleteKey
                          },
                          "remConnection": {
                              icon: './images/icon-trash.png',
                              label: 'Disconnect',
                              action: removeServer
                          }
                      };
                      var rel = node.original.rel;
                      if (typeof rel !== 'undefined' && rel !== 'root') {
                          delete menu['addKey'];
                      }
                      if (rel !== 'root') {
                          delete menu['remConnection'];
                      }
                      if (rel === 'root') {
                          delete menu['remKey'];
                      }
                      return menu;
                  }
              },
              plugins: [ "themes", "contextmenu" ]
          })
          .bind("select_node.jstree", treeNodeSelected)
          .delegate("a", "click", function (event, data) {
            event.preventDefault();
          })
          .on('keyup', function (e) {
              var key = e.which;
              // delete
              if (key === 46) {
                  var node = getKeyTree().get_selected(true)[0];
                  // do not allow deletion of entire server, only keys within
                  if (node.parent !== '#') {
                    var connId = node.parents[node.parents.length-2];
                    deleteKey(connId, getFullKeyPath(node));
                  }
              }
          });

        }
      });
    }
  });
}

function treeNodeSelected (event, data) {
  $('#body').html('Loading...');
  var connectionId;
  if (data.node.parent === '#') {
    connectionId = data.node.id;
    var hostAndPort = connectionId.split(':');
    $.get('apiv2/server/info', function (data, status) {
      if (status !== 'success') {
        return alert("Could not load server info");
      }
      data = JSON.parse(data);
      data.forEach(function (instance) {
        if (instance.host == hostAndPort[0] && instance.port == hostAndPort[1] && instance.db == hostAndPort[2]) {
          instance.connectionId = connectionId;
          var html = "";
          if (!instance.disabled) {
            html = new EJS({ url: 'templates/serverInfo.ejs' }).render(instance);
          }
          else {
              html = '<div>ERROR: ' + (instance.error ? instance.error : 'Server not available - cannot query status informations.') + '</div>'
          }
          $('#body').html(html);
          return setupAddKeyButton();
        }
      });
    });
  } else {
    connectionId = getRootConnection(data.node);
    var path = getFullKeyPath(data.node);
    return loadKey(connectionId, path);
  }
}

function getFullKeyPath (node) {
  if (node.parent === '#') {
      return '';
  }
  return node.id.substr(getRootConnection(node).length + 1);
}

function getRootConnection (node) {
  if (node.parent === '#') {
      return node.id;
  }
  return node.parents[node.parents.length-2];
}

function loadKey (connectionId, key, index) {
  if (index) {
    $.get('apiv2/key/' + encodeURIComponent(connectionId) + "/" + encodeURIComponent(key) + "?index=" + index, processData);
  } else {
    $.get('apiv2/key/' + encodeURIComponent(connectionId) + "/" + encodeURIComponent(key), processData);
  }
  function processData (data, status) {
    if (status !== 'success') {
      return alert("Could not load key data");
    }

    data = JSON.parse(data);
    data.connectionId = connectionId;
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
    resizeApp();
  }
}

function selectTreeNodeBranch (data) {
  var html = new EJS({ url: 'templates/editBranch.ejs' }).render(data);
  $('#body').html(html);
}

function setupEditListButton () {
  $('#editListValueForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#editListValueButton').button('loading');
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

  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#editListValueButton').button('reset');
      $('#editListValueModal').modal('hide');
    }, 500);
  }
}

function setupEditSetButton () {
  $('#editSetMemberForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#editSetMemberButton').button('loading');
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

  function saveComplete () {
    setTimeout(function () {
      $('#editSetMemberButton').button('reset');
      $('#editSetMemberModal').modal('hide');
      refreshTree();
      getKeyTree().select_node(0);
    }, 500);
  }
}

function setupEditZSetButton () {
  $('#editZSetMemberForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#editZSetValueButton').button('loading');
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

  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#editZSetValueButton').button('reset');
      $('#editZSetMemberModal').modal('hide');
    }, 500);
  }
}

function setupAddKeyButton (connectionId) {
  $('#newStringValue').val('');
  $('#newFieldName').val('');
  $('#keyScore').val('');
  $('#keyValue').keyup(function () {
    var action = "apiv2/key/" + encodeURIComponent(connectionId) + "/" + encodeURIComponent($(this).val());
    $('#addKeyForm').attr("action", action);
  });
  $('#keyType').change(function () {
    var score = $('#scoreWrap');
    if ($(this).val() === 'zset') {
      score.show();
    } else {
      score.hide();
    }
    var field = $('#fieldWrap');
    if ($(this).val() === 'hash') {
      field.show();
    } else {
      field.hide();
    }
  });
  $('#addKeyIsJson').on('change', function(element) {
    if (element.target.checked) addInputValidator('newStringValue', 'json');
    else removeInputValidator('newStringValue');
  });

  $('#addKeyForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#saveKeyButton').attr("disabled", "disabled").html("<i class='icon-refresh'></i> Saving");
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

  function saveComplete () {
    setTimeout(function () {
      $('#saveKeyButton').removeAttr("disabled").html("Save");
      refreshTree();
      $('#addKeyModal').modal('hide');
    }, 500);
  }
}

function setupEditHashButton () {
  $('#editHashFieldForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#editHashFieldButton').button('loading');
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

  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#editHashFieldButton').button('reset');
      $('#editHashFieldModal').modal('hide');
    }, 500);
  }
}

function selectTreeNodeString (data) {
  var html = new EJS({ url: 'templates/editString.ejs' }).render(data);
  var isJsonParsed = false;
  $('#body').html(html);

  try {
    JSON.parse(data.value);
    isJsonParsed = true;
  } catch (ex) {
    $('#isJson').prop('checked', false);
  }

  $('#stringValue').val(data.value);
  // a this is json now assume it shall be json if it is object or array, but not for numbers
  if (isJsonParsed && data.value.match(/^\s*[\{\[]/)) {
      $('#isJson').click();
  }

  try {
    $('#jqtree_string_div').html(JSONTree.create(JSON.parse(data.value)));
  } catch (err) {
    $('#jqtree_string_div').text('Text is no valid JSON: ' + err.message);
  }

  $('#editStringForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#saveKeyButton').attr("disabled", "disabled").html("<i class='icon-refresh'></i> Saving");
    },
    error: function (err) {
      console.log('save error', arguments);
      alert("Could not save '" + err.statusText + "'");
      saveComplete();
    },
    success: function () {
      refreshTree();
      getKeyTree().select_node(0);
      console.log('saved', arguments);
      saveComplete();
    }
  });

  function saveComplete () {
    setTimeout(function () {
      $('#saveKeyButton').removeAttr("disabled").html("Save");
    }, 500);
  }
}

function selectTreeNodeHash (data) {
  var html = new EJS({ url: 'templates/editHash.ejs' }).render(data);
  $('#body').html(html);

  $('#addHashFieldForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#saveHashFieldButton').button('loading');
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
  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#saveHashFieldButton').button('reset');
      $('#addHashFieldModal').modal('hide');
    }, 500);
  }
}

function selectTreeNodeSet (data) {
  var html = new EJS({ url: 'templates/editSet.ejs' }).render(data);
  $('#body').html(html);

  $('#addSetMemberForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#saveMemberButton').button('loading');
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
  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#saveMemberButton').button('reset');
      $('#addSetMemberModal').modal('hide');
    }, 500);
  }
}

function selectTreeNodeList (data) {
  if (data.items.length > 0) {
    var html = new EJS({ url: 'templates/editList.ejs' }).render(data);
    $('#body').html(html);
    $('#addListValueForm').ajaxForm({
      beforeSubmit: function () {
        console.log('saving');
        $('#saveValueButton').button('loading');
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
  } else {
    alert('Index out of bounds');
  }
  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#saveValueButton').button('reset');
      $('#addListValueModal').modal('hide');
    }, 500);
  }
}

function selectTreeNodeZSet (data) {
  if (data.items.length > 0) {
    var html = new EJS({ url: 'templates/editZSet.ejs' }).render(data);
    $('#body').html(html);
  } else {
    alert('Index out of bounds');
  }

  $('#addZSetMemberForm').ajaxForm({
    beforeSubmit: function () {
      console.log('saving');
      $('#saveZMemberButton').button('loading');
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
  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#saveZMemberButton').button('reset');
      $('#addZSetMemberModal').modal('hide');
    }, 500);
  }
}

function getKeyTree () {
  return $.jstree.reference('#keyTree');
}

function refreshTree () {
  getKeyTree().refresh();
}

function addKey (connectionId, key) {
  if (typeof(connectionId) === 'object') {
    // context menu click
    var node = getKeyTree().get_node(connectionId.reference[0]);
    key = getFullKeyPath(node);
    if (key.length > 0 && !key.endsWith(foldingCharacter)) {
      key = key + foldingCharacter;
    }
    connectionId = getRootConnection(node);
  }
  $('#addKeyForm').attr('action', 'apiv2/key/' + encodeURIComponent(connectionId) + "/" + encodeURIComponent(key));
  $('#keyValue').val(key);
  $('#addKeyModal').modal('show');
  setupAddKeyButton(connectionId);
}

function deleteKey (connectionId, key) {
  if (typeof(connectionId) === 'object') {
      // context menu click
      var node = getKeyTree().get_node(connectionId.reference[0]);
      key = getFullKeyPath(node);
      connectionId = getRootConnection(node);
  }
  var result = confirm('Are you sure you want to delete "' + key + ' from ' + connectionId + '"?');
  if (result) {
    $.post('apiv2/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(key) + '?action=delete', function (data, status) {
      if (status !== 'success') {
        return alert("Could not delete key");
      }

      refreshTree();
      getKeyTree().select_node(-1);
      $('#body').html('');
    });
  }
}

function decodeKey (connectionId, key) {
  if (typeof(connectionId) === 'object') {
      // context menu click
      var node = getKeyTree().get_node(connectionId.reference[0]);
      key = getFullKeyPath(node);
      connectionId = getRootConnection(node);
  }

  $.post('apiv2/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(key) + '?action=decode', function (data, status) {
    if (status !== 'success') {
      return alert("Could not decode key");
    }

    $('#base64Button').html('Encode <small>base64</small>')
      .off('click')
      .on('click', function() {
        encodeString(connectionId, key)
      });
    $('#stringValue').val(data);
  });
}

function encodeString (connectionId, key) {
  $.post('apiv2/encodeString/' + encodeURIComponent($('#stringValue').val()), function (data, status) {
    if (status !== 'success') {
      return alert("Could not encode key");
    }

    // needed to debounce
    setTimeout(function() {
      $('#base64Button').html('Decode <small>base64</small>')
        .off('click')
        .on('click', function() {
          decodeKey(connectionId,key)
        });
      $('#stringValue').val(data);
    }, 100);
  });
}

function deleteBranch (connectionId, branchPrefix) {
  var query = (branchPrefix.endsWith(foldingCharacter) ? branchPrefix : branchPrefix + foldingCharacter) + '*';
  var result = confirm('Are you sure you want to delete "' + query + ' from ' + connectionId + '"? This will delete all children as well!');
  if (result) {
    $.post('apiv2/keys/' + encodeURIComponent(connectionId) + "/" + encodeURIComponent(query) + '?action=delete', function (data, status) {
      if (status !== 'success') {
        return alert("Could not delete branch");
      }

      refreshTree();
      getKeyTree().select_node(-1);
      $('#body').html('');
    });
  }
}
function addListValue (connectionId, key) {
  $('#key').val(key);
  $('#addListValue').val("");
  $('#addListConnectionId').val(connectionId);
  $('#addListValueModal').modal('show');
}

function editListValue (connectionId, key, index, value) {
  $('#editListConnectionId').val(connectionId);
  $('#listKey').val(key);
  $('#listIndex').val(index);
  $('#listValue').val(value);
  $('#listValueIsJson').prop('checked', false);
  $('#editListValueModal').modal('show');
  setupEditListButton();
  enableJsonValidationCheck(value, '#listValueIsJson');
}

function addSetMember (connectionId, key) {
  $('#addSetKey').val(key);
  $('#addSetMemberName').val("");
  $('#addSetConnectionId').val(connectionId);
  $('#addSetMemberModal').modal('show');
}

function editSetMember (connectionId, key, member) {
  $('#setConnectionId').val(connectionId);
  $('#setKey').val(key);
  $('#setMember').val(member);
  $('#setOldMember').val(member);
  $('#setMemberIsJson').prop('checked', false);
  $('#editSetMemberModal').modal('show');
  setupEditSetButton();
  enableJsonValidationCheck(member, '#setMemberIsJson');
}

function addZSetMember (connectionId, key) {
    $('#addZSetKey').val(key);
    $('#addZSetScore').val("");
    $('#addZSetMemberName').val("");
    $('#addZSetConnectionId').val(connectionId);
    $('#addZSetMemberModal').modal('show');
}

function editZSetMember (connectionId, key, score, value) {
  $('#zSetConnectionId').val(connectionId);
  $('#zSetKey').val(key);
  $('#zSetScore').val(score);
  $('#zSetValue').val(value);
  $('#zSetOldValue').val(value);
  $('#zSetValueIsJson').prop('checked', false);
  $('#editZSetMemberModal').modal('show');
  setupEditZSetButton();
  enableJsonValidationCheck(value, '#zSetValueIsJson');
}

function addHashField (connectionId, key) {
    $('#addHashKey').val(key);
    $('#addHashFieldName').val("");
    $('#addHashFieldValue').val("");
    $('#addHashConnectionId').val(connectionId);
    $('#addHashFieldModal').modal('show');
}

function editHashField (connectionId, key, field, value) {
  $('#hashConnectionId').val(connectionId);
  $('#hashKey').val(key);
  $('#hashField').val(field);
  $('#hashFieldValue').val(value);
  $('#hashFieldIsJson').prop('checked', false);
  $('#editHashFieldModal').modal('show');
  setupEditHashButton();
  enableJsonValidationCheck(value, '#hashFieldIsJson');
}

/** check if given string value is valid json and, if so enable validation
 *  for given field if this is an json object or array. Do not automatically
 *  enable validation on numbers or quted strings. May be coincidence that this is json...
 *
 *  @param {string} value string to check if valid json
 *  @param {string} isJsonCheckBox id string of checkbox element to activate validation
 */
function enableJsonValidationCheck(value, isJsonCheckBox) {
  try {
    JSON.parse(value);
    // if this is valid json and is array or object assume we want validation active
    if (value.match(/^\s*[\{\[]/)) {
      $(isJsonCheckBox).click();
    }
  }
  catch {}
}

function removeListElement () {
  $('#listValue').val('REDISCOMMANDERTOMBSTONE');
  $('#editListValueForm').submit();
}

function removeSetElement () {
  $('#setMember').val('REDISCOMMANDERTOMBSTONE');
  $('#editSetMemberForm').submit();
}

function removeZSetElement () {
  $('#zSetValue').val('REDISCOMMANDERTOMBSTONE');
  $('#editZSetMemberForm').submit();
}

function removeHashField () {
  $('#hashFieldValue').val('REDISCOMMANDERTOMBSTONE');
  $('#editHashFieldForm').submit();
}

var commandLineScrollTop;
var CLIOpen = false;
function hideCommandLineOutput () {
  var output = $('#commandLineOutput');
  if (output.is(':visible') && $('#lockCommandButton').hasClass('disabled')) {
    output.slideUp(function () {
      resizeApp();
      configChange();
    });
    CLIOpen = false;
    commandLineScrollTop = output.scrollTop() + 20;
    $('#commandLineBorder').removeClass('show-vertical-scroll');
  }
}

function showCommandLineOutput () {
  var output = $('#commandLineOutput');
  if (!output.is(':visible') && $('#lockCommandButton').hasClass('disabled')) {
    output.slideDown(function () {
      output.scrollTop(commandLineScrollTop);
      resizeApp();
      configChange();
    });
    CLIOpen = true;
    $('#commandLineBorder').addClass('show-vertical-scroll');
  }
}

function loadCommandLine () {
  $('#commandLine').click(function () {
    showCommandLineOutput();
  });
  $('#app-container').click(function () {
    hideCommandLineOutput();
  });

  var readline = require("readline-browserify");
  var output = document.getElementById('commandLineOutput');
  var rl = readline.createInterface({
    elementId: 'commandLine',
    write: function (data) {
      if (output.innerHTML.length > 0) {
        output.innerHTML += "<br>";
      }
      output.innerHTML += escapeHtml(data);
      output.scrollTop = output.scrollHeight;
    },
    completer: function (linePartial, callback) {
      cmdparser.completer(linePartial, callback);
    }
  });
  rl.setPrompt('redis> ');
  rl.prompt();
  rl.on('line', function (line) {
    if (output.innerHTML.length > 0) {
      output.innerHTML += "<br>";
    }
    output.innerHTML += "<span class='commandLineCommand'>" + escapeHtml(line) + "</span>";

    line = line.trim();

    if (line.toLowerCase() === 'refresh') {
      rl.prompt();
      refreshTree();
      rl.write("OK");
    } else {
      $.post('apiv2/exec/' + encodeURIComponent($('#selectedConnection').val()), { cmd: line }, function (data, status) {
        rl.prompt();

        if (status !== 'success') {
          return alert("Could not delete branch");
        }

        try {
          data = JSON.parse(data);
        } catch (ex) {
          rl.write(data);
          return;
        }
        if (data instanceof Array) {
          for (var i = 0; i < data.length; i++) {
            rl.write((i + 1) + ") " + data[i]);
          }
        } else {
          try {
            data = JSON.parse(data);
          } catch (ex) {
            // do nothing
          }
          rl.write(JSON.stringify(data, null, '  '));
        }
      });
      refreshTree();
    }
  });
}

/** Remove all input validators attached to an form element (keyup handler)
 *  as well as visual decorations applied
 *
 *  @param {string|object} inputId id of input element or jquery object to remove handler and decoration from
 */
function removeInputValidator(inputId) {
  if (typeof inputId === 'string') {
      inputId = $(document.getElementById(inputId));
  }
  inputId.off('keyup').removeClass('validate-negative').removeClass('validate-positive');
}

/** Add data format validation function to an input element.
 *  The field gets decorated to visualize if input is valid for given data format.
 *
 *  @param {string|object} inputId id of html input element to watch or jquery object
 *  @param {string} format data format to validate against, possible values: "json"
 *  @param {boolean} [currentState] optional start state to set now
 */
function addInputValidator(inputId, format, currentState) {
  var input;
  if (typeof inputId === 'string') {
    input = $('#' + inputId)
  }
  else if (typeof inputId === 'object') {
    input = inputId;
  }

  if (!input){
    console.log('Invalid html id given to validate format: ', inputId);
    return;
  }

  switch (format) {
    case 'json':
        input.on('keyup', validateInputAsJson);
        break;
    default:
        console.log('Invalid format given to validate input: ', format);
        return;
  }

  // set initial state if requested
  if (typeof currentState === 'boolean') {
    setValidationClasses(input.get(0), currentState);
  }
  else {
    input.trigger( "keyup" );
  }
}

/** method to check if a input field contains valid json and set visual accordingly.
 *
 */
function validateInputAsJson() {
  if (this.value) {
    try {
      JSON.parse(this.value);
      setValidationClasses(this, true);
    }
    catch(e) {
      setValidationClasses(this, false);
    }
  }
  else {
    setValidationClasses(this, false)
  }
}

/** classes are only changed if not set right now
 *
 * @param {Element} element HTML DOM element to change validation classes
 * @param {boolean} success true if positive validation class shall be assigned, false for error class
 */
function setValidationClasses(element, success) {
  var add = (success ? 'validate-positive' : 'validate-negative');
  var remove = (success ? 'validate-negative' : 'validate-positive');
  if (element.className.indexOf(add) < 0) {
    $(element).removeClass(remove).addClass(add);
  }
}

function escapeHtml (str) {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/\s/g, '&nbsp;');
}

var cmdparser = new CmdParser([
  "REFRESH",

  "APPEND key value",
  "AUTH password",
  "BGREWRITEAOF",
  "BGSAVE",
  "BITCOUNT key [start] [end]",
  "BITOP operation destkey key [key ...]",
  "BLPOP key [key ...] timeout",
  "BRPOP key [key ...] timeout",
  "BRPOPLPUSH source destination timeout",
  "CONFIG GET parameter",
  "CONFIG SET parameter value",
  "CONFIG RESETSTAT",
  "DBSIZE",
  "DEBUG OBJECT key",
  "DEBUG SEGFAULT",
  "DECR key",
  "DECRBY key decrement",
  "DEL key [key ...]",
  "DISCARD",
  "DUMP key",
  "ECHO message",
  "EVAL script numkeys key [key ...] arg [arg ...]",
  "EVALSHA sha1 numkeys key [key ...] arg [arg ...]",
  "EXEC",
  "EXISTS key",
  "EXPIRE key seconds",
  "EXPIREAT key timestamp",
  "FLUSHALL",
  "FLUSHDB",
  "GET key",
  "GETBIT key offset",
  "GETRANGE key start end",
  "GETSET key value",
  "HDEL key field [field ...]",
  "HEXISTS key field",
  "HGET key field",
  "HGETALL key",
  "HINCRBY key field increment",
  "HINCRBYFLOAT key field increment",
  "HKEYS key",
  "HLEN key",
  "HMGET key field [field ...]",
  "HMSET key field value [field value ...]",
  "HSET key field value",
  "HSETNX key field value",
  "HVALS key",
  "INCR key",
  "INCRBY key increment",
  "INCRBYFLOAT key increment",
  "INFO",
  "KEYS pattern",
  "LASTSAVE",
  "LINDEX key index",
  "LINSERT key BEFORE|AFTER pivot value",
  "LLEN key",
  "LPOP key",
  "LPUSH key value [value ...]",
  "LPUSHX key value",
  "LRANGE key start stop",
  "LREM key count value",
  "LSET key index value",
  "LTRIM key start stop",
  "MGET key [key ...]",
  "MIGRATE host port key destination-db timeout",
  "MONITOR",
  "MOVE key db",
  "MSET key value [key value ...]",
  "MSETNX key value [key value ...]",
  "MULTI",
  "OBJECT subcommand [arguments ...]",
  "PERSIST key",
  "PEXPIRE key milliseconds",
  "PEXPIREAT key milliseconds-timestamp",
  "PING",
  "PSETEX key milliseconds value",
  "PSUBSCRIBE pattern [pattern ...]",
  "PTTL key",
  "PUBLISH channel message",
  "PUNSUBSCRIBE [pattern ...]",
  "QUIT",
  "RANDOMKEY",
  "RENAME key newkey",
  "RENAMENX key newkey",
  "RESTORE key ttl serialized-value",
  "RPOP key",
  "RPOPLPUSH source destination",
  "RPUSH key value [value ...]",
  "RPUSHX key value",
  "SADD key member [member ...]",
  "SAVE",
  "SCARD key",
  "SCRIPT EXISTS script [script ...]",
  "SCRIPT FLUSH",
  "SCRIPT KILL",
  "SCRIPT LOAD script",
  "SDIFF key [key ...]",
  "SDIFFSTORE destination key [key ...]",
  "SELECT index",
  "SET key value",
  "SETBIT key offset value",
  "SETEX key seconds value",
  "SETNX key value",
  "SETRANGE key offset value",
  "SHUTDOWN [NOSAVE|SAVE]",
  "SINTER key [key ...]",
  "SINTERSTORE destination key [key ...]",
  "SISMEMBER key member",
  "SLAVEOF host port",
  "SLOWLOG subcommand [argument]",
  "SMEMBERS key",
  "SMOVE source destination member",
  "SORT key [BY pattern] [LIMIT offset count] [GET pattern [GET pattern ...]] [ASC|DESC] [ALPHA] [STORE destination]",
  "SPOP key",
  "SRANDMEMBER key",
  "SREM key member [member ...]",
  "STRLEN key",
  "SUBSCRIBE channel [channel ...]",
  "SUNION key [key ...]",
  "SUNIONSTORE destination key [key ...]",
  "SYNC",
  "TIME",
  "TTL key",
  "TYPE key",
  "UNSUBSCRIBE [channel ...]",
  "UNWATCH",
  "WATCH key [key ...]",
  "ZADD key score member [score] [member]",
  "ZCARD key",
  "ZCOUNT key min max",
  "ZINCRBY key increment member",
  "ZINTERSTORE destination numkeys key [key ...] [WEIGHTS weight [weight ...]] [AGGREGATE SUM|MIN|MAX]",
  "ZRANGE key start stop [WITHSCORES]",
  "ZRANGEBYSCORE key min max [WITHSCORES] [LIMIT offset count]",
  "ZRANK key member",
  "ZREM key member [member ...]",
  "ZREMRANGEBYRANK key start stop",
  "ZREMRANGEBYSCORE key min max",
  "ZREVRANGE key start stop [WITHSCORES]",
  "ZREVRANGEBYSCORE key max min [WITHSCORES] [LIMIT offset count]",
  "ZREVRANK key member",
  "ZSCORE key member",
  "ZUNIONSTORE destination numkeys key [key ...] [WEIGHTS weight [weight ...]] [AGGREGATE SUM|MIN|MAX]"
], {
  key: function (partial, callback) {
    var redisConnection = $('#selectedConnection').val();
    $.get('apiv2/keys/' + encodeURIComponent(redisConnection) + "/" + partial + '*?limit=20', function (data, status) {
      if (status !== 'success') {
        return callback(new Error("Could not get keys"));
      }
      data = JSON.parse(data)
        .filter(function (item) {
          return item.toLowerCase().indexOf(partial.toLowerCase()) === 0;
        });
      return callback(null, data);
    });
  }
});

var configTimer;
var prevSidebarWidth;
var prevLocked;
var prevCLIWidth;
var prevCLIOpen;
var configLoaded = false;

function getServerInfo (callback) {
  $.get('apiv2/server/info', function (data, status) {
    callback(JSON.parse(data))
  });
}

function removeServer (connectionId) {
  if (typeof(connectionId) === 'object') {
      // context menu click
      var node = getKeyTree().get_node(connectionId.reference[0]);
      connectionId = getRootConnection(node);
  }
  var result = confirm('Are you sure you want to disconnect from "' + connectionId + '"?');
  if (result) {
    $.post('logout/' + encodeURIComponent(connectionId), function (err, status) {
      if (status !== 'success') {
        return alert("Could not remove instance");
      }
      $(window).unbind('beforeunload');
      location.reload();
    });
  }
}

function addServer () {
  $('#addServerForm').submit();
}

function loadDefaultServer (host, port) {
  console.log("host" + host);
  console.log("port" + port);
  $('#hostname').val(host);
  $('#port').val(port);
  $('#addServerForm').submit();
}

function configChange () {
  if (!configLoaded) {
    var sidebarWidth = $('#sideBar').width();
    var locked = !$('#lockCommandButton').hasClass('disabled');
    var CLIWidth = $('#commandLineContainer').height();

    if (typeof(prevSidebarWidth) !== 'undefined' &&
      (sidebarWidth != prevSidebarWidth ||
        locked != prevLocked ||
        CLIWidth != prevCLIWidth ||
        CLIOpen != prevCLIOpen)) {
      clearTimeout(configTimer);
      configTimer = setTimeout(saveConfig, 2000);
    }
    prevSidebarWidth = sidebarWidth;
    prevLocked = locked;
    prevCLIWidth = CLIWidth;
    prevCLIOpen = CLIOpen;
  } else {
    configLoaded = false;
  }
}

function saveConfig () {
  var sidebarWidth = $('#sideBar').width();
  var locked = !$('#lockCommandButton').hasClass('disabled');
  var CLIHeight = $('#commandLineContainer').height();
  $.get('config', function (config) {
    if (config) {
      config["sidebarWidth"] = sidebarWidth;
      config["locked"] = locked;
      config["CLIHeight"] = CLIHeight;
      config["CLIOpen"] = CLIOpen;
      $.post('config', config, function (data, status) {
      });
    } else {
      config = {
        "sidebarWidth": sidebarWidth,
        "locked": locked,
        "CLIHeight": CLIHeight,
        "CLIOpen": CLIOpen,
        "default_connections": []
      };
      $.post('config', config, function (data, status) {
      });
    }
  });
}

function loadConfig (callback) {
  $.get('config', function (data) {
    if (data) {
      if (data['sidebarWidth']) {
        $('#sideBar').width(data['sidebarWidth']);
      }
      if (data['CLIOpen'] == "true") {
        $('#commandLineOutput').slideDown(0, function () {
          if (data['CLIHeight']) {
            $('#commandLineOutput').height(data['CLIHeight']);
          }
        });
        CLIOpen = true;
      }
      if (data['locked'] == "true") {
        $('#lockCommandButton').removeClass('disabled');
      } else {
        $('#lockCommandButton').addClass('disabled');
      }
      configLoaded = true;
      if (callback) {
        callback();
      }
    }
  });
}

function resizeApp () {
  var barWidth = $('#keyTree').outerWidth(true);
  $('#sideBar').css('width', barWidth);
  var bodyMargin = parseInt($('#body').css('margin-left'), 10);
  var newBodyWidth = $(window).width() - barWidth - bodyMargin;
  $('#body,#itemActionsBar').css('width', newBodyWidth).css('left', barWidth);

  $('#keyTree').height($(window).height() - $('#keyTree').offset().top - $('#commandLineContainer').outerHeight(true));
  $('#body, #sidebarResize').css('height', $('#sideBar').css('height'));
  configChange();
}

function setupResizeEvents () {
  var sidebarResizing = false;
  var sidebarFrame = $("#sideBar").width();
  var commandResizing = false;
  var commandFrame = $('#commandLineOutput').height();

  $('#keyTree').bind('resize', resizeApp);
  $(window).bind('resize', resizeApp);

  $(document).mouseup(function (event) {
    sidebarResizing = false;
    sidebarFrame = $("#sideBar").width();
    commandResizing = false;
    commandFrame = $('#commandLineOutput').height();
    $('body').removeClass('select-disabled');
  });

  $("#sidebarResize").mousedown(function (event) {
    sidebarResizing = event.pageX;
    $('body').addClass('select-disabled');
  });

  $("#commandLineBorder").mousedown(function (event) {
    commandResizing = event.pageY;
    $('body').addClass('select-disabled');
  });

  $(document).mousemove(function (event) {
    if (sidebarResizing) {
      $("#sideBar").width(sidebarFrame - (sidebarResizing - event.pageX));
    } else if (commandResizing &&
      $('#commandLineOutput').is(':visible')) {
      $("#commandLineOutput").height(commandFrame + (commandResizing - event.pageY));
      resizeApp();
    }
  });
}

function setupCommandLock () {
  $('#lockCommandButton').click(function () {
    $(this).toggleClass('disabled');
    configChange();
  });
}

function setupCLIKeyEvents () {
  var ctrl_down = false;
  var isMac = navigator.appVersion.indexOf("Mac") != -1;
  var cli = $('#_readline_cliForm input');
  cli.on('keydown', function (e) {
    var key = e.which;
    //ctrl
    if (key === 17 && isMac) {
      ctrl_down = true;
    }

    //c
    if (key === 67 && ctrl_down) {
      clearCLI();
      e.preventDefault();
    }

    //esc
    if (key === 27) {
      clearCLI();
      e.preventDefault();
    }
  });
  cli.on('keyup', function (e) {
    var key = e.which;
    //ctrl
    if (key === 17 && isMac) {
      ctrl_down = false;
    }
  });

  function clearCLI () {
    var cli = $('#_readline_cliForm input');
    if (cli.val() == '') {
      hideCommandLineOutput();
    } else {
      cli.val('');
    }
  }
}

function toggleRedisModal() {
  var redisModal = $('#redisCommandsModal');
  // change 'modal' to 'bs.modal' for bootstrap >=3, isShown to _isShown for bootstrap 4
  if ((redisModal.data('modal') || {}).isShown) {
      redisModal.modal('hide');
  }
  else {
      var redisIframe = redisModal.find('#redisCommandsModalSrc');
      if (!redisIframe.attr('src')) {
          redisIframe.attr('src', 'https://redis.io/commands');
          redisModal.find('#redisCommandsExternal').attr('href', 'https://redis.io/commands');
      }
      redisModal.modal('show');
  }
}

$(function() {
  function refreshQueryToken() {
    $.post('signin', {}, function (data, status) {
      if ((status !== 'success') || !data || !data.ok) {
        console.error("Cannot refresh query token");
        return;
      }
      sessionStorage.setItem('redisCommanderBearerToken', data.bearerToken);
      sessionStorage.setItem('redisCommanderQueryToken', data.queryToken);
    })
    .fail(function(err) {
      console.error("Failed to refresh query token", err);
    });
  }

  /**
   * Export redis data.
   */
  $('#app-container').on('submit', '#redisExportForm', function () {
    window.open("tools/export?" + $(this).serialize() + '&redisCommanderQueryToken=' + encodeURIComponent(sessionStorage.getItem('redisCommanderQueryToken')), '_blank');
    refreshQueryToken();
    return false;
  });

  /**
   * Import redis data.
   */
  $('#app-container').on('submit', '#redisImportForm', function () {
    $('#body').html('<h2>Import</h2>Importing in progress. Prease wait...');

    $.ajax({
      type: 'POST',
      url: 'tools/import',
      data: $(this).serialize() + '&redisCommanderQueryToken=' + encodeURIComponent(sessionStorage.getItem('redisCommanderQueryToken') || ''),
      dataType: 'JSON',
      success: function (res) {
        $('#body').html('<h2>Import</h2>' +
          '<div>Inserted: ' + res.inserted + '</div>' +
          '<div>Errors: ' + res.errors + '</div><br/>' +
          '<span class="label label-' + (res.errors ? 'important' : 'success') + '">' + (res.errors ? 'Errors' : 'Success') + '</span>');
      }
    });
    refreshQueryToken();
    return false;
  });

  /**
   * Show import form.
   */
  $('#redisImportData').on('click', function () {
    $.ajax({
      type: 'POST',
      url: 'tools/forms/import',
      success: function (res) {
        $('#body').html(res);
      }
    });
  });

  /**
   * Show export form.
   */
  $('#redisExportData').on('click', function () {
    $.ajax({
      type: 'POST',
      url: 'tools/forms/export',
      success: function (res) {
        $('#body').html(res);
      }
    });
  });

  /**
   * Refresh and expand all nodes in tree
   */
  $('#expandAllNodes').on('click', function () {
    refreshTree();
    $('#keyTree').jstree('open_all');
  });
});

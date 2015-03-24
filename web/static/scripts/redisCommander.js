'use strict';
var foldingCharacter = ":";

var CmdParser = require('cmdparser');
function loadTree () {
  $.get('/apiv1/connection', function (isConnected) {
    if (isConnected) {
      $('#keyTree').bind("loaded.jstree", function () {
        var tree = getKeyTree();
        if (tree) {
          var root = tree._get_children(-1)[0];
          tree.open_node(root, null, true);
        }
      });
      getServerInfo(function (data) {
        var json_dataData = [];

        data.forEach(function (instance, index) {
          var label = instance.label;
          var host = instance.host;
          var port = instance.port;
          var db = instance.db;
          json_dataData.push({
            data: label + " (" + host + ":" + port + ":" + db + ")",
            state: "closed",
            attr: {
              id: host + ":" + port + ":" + db,
              rel: "root"
            }
          });
          if (index === data.length - 1) {
            return onJSONDataComplete();
          }
        });
        function onJSONDataComplete () {
          $('#keyTree').jstree({
            json_data: {
              data: json_dataData,
              ajax: {
                url: function (node) {
                  if (node !== -1) {
                    var path = getFullKeyPath(node);
                    var root = getRootConnection(node);
                    return '/apiv1/keystree/' + encodeURIComponent(root) + '/' + encodeURIComponent(path) + '?absolute=false';
                  }
                  var root = getRootConnection(node);
                  return '/apiv1/keystree/' + encodeURIComponent(root);
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
            contextmenu: {
              items: function (node) {
                var menu = {
                  "addKey": {
                    icon: 'icon-plus',
                    label: "Add Key",
                    action: addKey
                  },
                  "refresh": {
                    icon: 'icon-refresh',
                    label: "Refresh",
                    action: function (obj) {
                      jQuery.jstree._reference("#keyTree").refresh(obj);
                    }
                  },
                  "remKey": {
                    icon: 'icon-trash',
                    label: 'Remove Key',
                    action: deleteKey
                  },
                  "remConnection": {
                    icon: 'icon-trash',
                    label: 'Disconnect',
                    action: removeServer
                  }
                };
                var rel = node.attr('rel');
                if (rel != undefined && rel != 'root') {
                  delete menu['addKey'];
                }
                if (rel != 'root') {
                  delete menu['remConnection'];
                }
                if (rel == 'root') {
                  delete menu['remKey'];
                }
                return menu;
              }
            },
            plugins: [ "themes", "json_data", "types", "ui", "contextmenu" ]
          })
            .bind("select_node.jstree", treeNodeSelected)
            .delegate("a", "click", function (event, data) {
              event.preventDefault();
            });
        }
      });
    }
  });
}

function treeNodeSelected (event, data) {
  $('#body').html('Loading...');

  var pathParts = getKeyTree().get_path(data.rslt.obj, true);
  var path = pathParts.slice(1).join(foldingCharacter);
  var connectionId = pathParts.slice(0, 1)[0];
  if (pathParts.length === 1) {
    var hostAndPort = pathParts[0].split(':');
    $.get('/apiv1/server/info', function (data, status) {
      if (status != 'success') {
        return alert("Could not load server info");
      }
      data = JSON.parse(data);
      data.forEach(function (instance) {
        if (instance.host == hostAndPort[0] && instance.port == hostAndPort[1]) {
          instance.connectionId = connectionId;
          var html = new EJS({ url: '/templates/serverInfo.ejs' }).render(instance);
          $('#body').html(html);
          return setupAddKeyButton();
        }
      });
    });
  } else {
    return loadKey(connectionId, path);
  }
}

function getFullKeyPath (node) {
  return $.jstree._focused().get_path(node, true).slice(1).join(foldingCharacter);
}

function getRootConnection (node) {
  return $.jstree._focused().get_path(node, true).slice(0, 1);
}

function loadKey (connectionId, key, index) {
  if (index) {
    $.get('/apiv1/key/' + encodeURIComponent(connectionId) + "/" + encodeURIComponent(key) + "/" + index, processData);
  } else {
    $.get('/apiv1/key/' + encodeURIComponent(connectionId) + "/" + encodeURIComponent(key), processData);
  }
  function processData (data, status) {
    if (status != 'success') {
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
  var html = new EJS({ url: '/templates/editBranch.ejs' }).render(data);
  $('#body').html(html);
}
function setupEditListButton () {
  $('#editListRowForm').ajaxForm({
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
      $('#editListValueButton').button('reset');
      saveComplete();
    }
  });

  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#editListRowModal').modal('hide');
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
      $('#editSetMemberButton').button('reset');
      saveComplete();
    }
  });

  function saveComplete () {
    setTimeout(function () {
      $('#editSetMemberModal').modal('hide');
      refreshTree();
      getKeyTree().select_node(0);
    }, 500);
  }
}
function setupEditZSetButton () {
  $('#editZSetRowForm').ajaxForm({
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
      $('#editZSetValueButton').button('reset');
      saveComplete();
    }
  });

  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#editZSetRowModal').modal('hide');
    }, 500);
  }
}

function setupAddKeyButton (connectionId) {
  $('#keyValue').keyup(function () {
    var action = "/apiv1/key/" + encodeURIComponent(connectionId) + "/" + encodeURIComponent($(this).val());
    $('#addKeyForm').attr("action", action);
  });
  $('#keyType').change(function () {
    var score = $('#scoreWrap');
    if ($(this).val() == 'zset') {
      score.show();
    } else {
      score.hide();
    }
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

  function saveComplete () {
    setTimeout(function () {
      $('#saveKeyButton').html("Save");
      $('#saveKeyButton').removeAttr("disabled");
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
      $('#editHashFieldButton').button('reset');
      saveComplete();
    }
  });

  function saveComplete () {
    setTimeout(function () {
      refreshTree();
      getKeyTree().select_node(0);
      $('#editHashRowModal').modal('hide');
    }, 500);
  }
}

function selectTreeNodeString (data) {
  var html = new EJS({ url: '/templates/editString.ejs' }).render(data);
  $('#body').html(html);

  try {
    data.value = JSON.stringify(JSON.parse(data.value), null, '  ');
    $('#isJson').val('true');
  } catch (ex) {
    $('#isJson').val('false');
  }

  $('#stringValue').val(data.value);
  $('#jqtree_string_div').html(JSONTree.create(JSON.parse(data.value)));
  $('#stringValue').keyup(function () {
    $('#stringValueClippy').clippy({'text': $(this).val(), clippy_path: "/clippy-jquery/clippy.swf"});
    var dataTree;
    try {
      dataTree = JSONTree.create(JSON.parse($(this).val()));
    } catch (err) {
      dataTree = err.message;
    }
    $('#jqtree_string_div').html(dataTree);
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
      refreshTree();
      getKeyTree().select_node(0);
      console.log('saved', arguments);
      saveComplete();
    }
  });

  function saveComplete () {
    setTimeout(function () {
      $('#saveKeyButton').html("Save");
      $('#saveKeyButton').removeAttr("disabled");
    }, 500);
  }
}

function selectTreeNodeHash (data) {
  var html = new EJS({ url: '/templates/editHash.ejs' }).render(data);
  $('#body').html(html);
}

function selectTreeNodeSet (data) {
  var html = new EJS({ url: '/templates/editSet.ejs' }).render(data);
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
      $('#saveMemberButton').button('reset');
      saveComplete();
    }
  });
  function saveComplete () {
    setTimeout(function () {
      $('#addSetMemberModal').modal('hide');
      $('a.jstree-clicked').click();
    }, 500);
  }
}

function selectTreeNodeList (data) {
  if (data.items.length > 0) {
    var html = new EJS({ url: '/templates/editList.ejs' }).render(data);
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
        $('#saveValueButton').button('reset');
        saveComplete();
      }
    });
  } else {
    alert('Index out of bounds');
  }
  function saveComplete () {
    setTimeout(function () {
      $('#addListValueModal').modal('hide');
      $('a.jstree-clicked').click();
    }, 500);
  }
}

function selectTreeNodeZSet (data) {
  if (data.items.length > 0) {
    var html = new EJS({ url: '/templates/editZSet.ejs' }).render(data);
    $('#body').html(html);
  } else {
    alert('Index out of bounds');
  }
}

function getKeyTree () {
  return $.jstree._reference('#keyTree');
}

function refreshTree () {
  getKeyTree().refresh();
}

function addKey (connectionId, key) {
  if (typeof(connectionId) == 'object') {
    key = getFullKeyPath(connectionId);
    if (key.length > 0) {
      key = key + ":";
    }
    var pathParts = getKeyTree().get_path(connectionId, true);
    connectionId = pathParts.slice(0, 1)[0];
  }
  $('#addKeyForm').attr('action', '/apiv1/key/' + encodeURIComponent(connectionId) + "/" + encodeURIComponent(key));
  $('#keyValue').val(key);
  $('#addKeyModal').modal('show');
  setupAddKeyButton(connectionId);
}
function deleteKey (connectionId, key) {
  if (typeof(connectionId) == 'object') {
    key = getFullKeyPath(connectionId);
    var pathParts = getKeyTree().get_path(connectionId, true);
    connectionId = pathParts.slice(0, 1)[0];
  }
  var result = confirm('Are you sure you want to delete "' + key + ' from ' + connectionId + '"?');
  if (result) {
    $.post('/apiv1/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(key) + '?action=delete', function (data, status) {
      if (status != 'success') {
        return alert("Could not delete key");
      }

      refreshTree();
      getKeyTree().select_node(-1);
      $('#body').html('');
    });
  }
}


function deleteBranch (connectionId, branchPrefix) {
  var query = branchPrefix + ':*';
  var result = confirm('Are you sure you want to delete "' + query + ' from ' + connectionId + '"? This will delete all children as well!');
  if (result) {
    $.post('/apiv1/keys/' + encodeURIComponent(connectionId) + "/" + encodeURIComponent(query) + '?action=delete', function (data, status) {
      if (status != 'success') {
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
  $('#addStringValue').val("");
  $('#addListConnectionId').val(connectionId);
  $('#addListValueModal').modal('show');
}
function editListRow (connectionId, key, index, value) {
  $('#editListConnectionId').val(connectionId);
  $('#listKey').val(key);
  $('#listIndex').val(index);
  $('#listValue').val(value);
  $('#editListRowModal').modal('show');
  setupEditListButton();
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
  $('#editSetMemberModal').modal('show');
  setupEditSetButton();
}
function editZSetRow (connectionId, key, score, value) {
  $('#zSetConnectionId').val(connectionId);
  $('#zSetKey').val(key);
  $('#zSetScore').val(score);
  $('#zSetValue').val(value);
  $('#zSetOldValue').val(value);
  $('#editZSetRowModal').modal('show');
  setupEditZSetButton();
}
function editHashRow (connectionId, key, field, value) {
  $('#hashConnectionId').val(connectionId);
  $('#hashKey').val(key);
  $('#hashField').val(field);
  $('#hashFieldValue').val(value);
  $('#editHashRowModal').modal('show');
  setupEditHashButton();
}
function removeListElement () {
  $('#listValue').val('REDISCOMMANDERTOMBSTONE');
  $('#editListRowForm').submit();
}
function removeSetElement () {
  $('#setMember').val('REDISCOMMANDERTOMBSTONE');
  $('#editSetMemberForm').submit();
}
function removeZSetElement () {
  $('#zSetValue').val('REDISCOMMANDERTOMBSTONE');
  $('#editZSetRowForm').submit();
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
      $.post('/apiv1/exec', { cmd: line, connection: $('#selectedConnection').val() }, function (data, status) {
        rl.prompt();

        if (status != 'success') {
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
    $.get('/apiv1/keys/' + encodeURIComponent(redisConnection) + "/" + partial + '*?limit=20', function (data, status) {
      if (status != 'success') {
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
  $.get('/apiv1/server/info', function (data, status) {
    callback(JSON.parse(data))
  });
}

function removeServer (connectionId) {
  if (typeof(connectionId) == 'object') {
    var pathParts = getKeyTree().get_path(connectionId, true);
    connectionId = pathParts.slice(0, 1)[0];
  }
  var result = confirm('Are you sure you want to disconnect from "' + connectionId + '"?');
  if (result) {
    $.post('/logout/' + encodeURIComponent(connectionId), function (err, status) {
      if (status != 'success') {
        return alert("Could not remove instance");
      }
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

    if (typeof(prevSidebarWidth) != 'undefined' &&
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
  $.get('/config', function (config) {
    if (config) {
      config["sidebarWidth"] = sidebarWidth;
      config["locked"] = locked;
      config["CLIHeight"] = CLIHeight;
      config["CLIOpen"] = CLIOpen;
      $.post('/config', config, function (data, status) {
      });
    } else {
      var config = {
        "sidebarWidth": sidebarWidth,
        "locked": locked,
        "CLIHeight": CLIHeight,
        "CLIOpen": CLIOpen,
        "default_connections": []
      };
      $.post('/config', config, function (data, status) {
      });
    }
  });
}
function loadConfig (callback) {
  $.get('/config', function (data) {
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
  $('#body,#itemActionsBar').css('width', newBodyWidth);
  $('#body,#itemActionsBar').css('left', barWidth);

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
  cli.live('keydown', function (e) {
    var key = e.which;
    //ctrl
    if (key == 17 && isMac) {
      ctrl_down = true;
    }

    //c
    if (key == 67 && ctrl_down) {
      clearCLI();
      e.preventDefault();
    }

    //esc
    if (key == 27) {
      clearCLI();
      e.preventDefault();
    }
  });
  cli.live('keyup', function (e) {
    var key = e.which;
    //ctrl
    if (key == 17 && isMac) {
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

$(function() {
  /**
   * Export redis data.
   */
  $('#app-container').on('submit', '#redisExportForm', function () {
    window.open("/tools/export?" + $(this).serialize(), '_blank');
    return false;
  });

  /**
   * Import redis data.
   */
  $('#app-container').on('submit', '#redisImportForm', function () {
    $('#body').html('<h2>Import</h2>Importing in progress. Prease wait...');

    $.ajax({
      type: 'POST',
      url: '/tools/import',
      data: $(this).serialize(),
      dataType: 'JSON',
      success: function (res) {
        $('#body').html('<h2>Import</h2>' +
          '<div>Inserted: ' + res.inserted + '</div>' +
          '<div>Errors: ' + res.errors + '</div><br/>' +
          '<span class="label label-' + (res.errors ? 'important' : 'success') + '">' + (res.errors ? 'Errors' : 'Success') + '</span>');
      }
    });

    return false;
  });

  /**
   * Show import form.
   */
  $('#redisImportData').on('click', function () {
    $.ajax({
      type: 'POST',
      url: '/tools/forms/import',
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
      url: '/tools/forms/export',
      success: function (res) {
        $('#body').html(res);
      }
    });
  });
});

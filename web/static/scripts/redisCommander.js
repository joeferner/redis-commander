'use strict';

var CmdParser = require('cmdparser');

function loadTree() {
  $('#keyTree').bind("loaded.jstree", function () {
    var tree = getKeyTree();
    if (tree) {
      var root = tree._get_children(-1)[0];
      tree.open_node(root, null, true);
    }
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
            return '/apiv1/keystree/' + path + '?absolute=false';
          }
          return '/apiv1/keystree';
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
      setupAddKeyButton();
    });
  } else {
    var path = pathParts.slice(1).join(':');
    loadKey(path);
  }
}
function loadKey(key) {
  $.get('/apiv1/key/' + key, function (data, status) {
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
      resizeApp();
    });
}
function selectTreeNodeBranch(data) {
  var html = new EJS({ url: '/templates/editBranch.ejs' }).render(data);
  $('#body').html(html);
  setupAddKeyButton();
}
function setupAddKeyButton() {
  $('#keyValue').keyup(function () {
    var action = "/apiv1/key/" + $(this).val();
    $('#addKeyForm').attr("action", action);
  });
  $('#keyType').change(function () {
    var score = $('#scoreWrap');
    if($(this).val() == 'zset'){
      score.show();
    }else{
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
  $('#stringValue').keyup(function () {
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
  if(data.items.length > 0){
    var html = new EJS({ url: '/templates/editList.ejs' }).render(data);
    $('#body').html(html);
    $('#addListValueForm').ajaxForm({
      beforeSubmit: function () {
        console.log('saving');
        $('#saveValueButton').attr("disabled", "disabled");
        $('#saveValueButton').html("<i class='icon-refresh'></i> Saving");
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
  }else{
    alert('Index out of bounds');
  }
  function saveComplete() {
    setTimeout(function () {
      $('#addListValueModal').modal('hide');
      $('a.jstree-clicked').click();
    }, 500);
  }
}

function selectTreeNodeZSet(data) {
  if(data.items.length > 0){
    var html = new EJS({ url: '/templates/editZSet.ejs' }).render(data);
    $('#body').html(html);
  }else{
    alert('Index out of bounds');
  }
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

var commandLineScrollTop;

function hideCommandLineOutput() {
  var output = $('#commandLineOutput');
  if (output.is(':visible') && $('#lockCommandButton').hasClass('disabled')) {
    output.slideUp(function () {
      resizeApp();
    });
    commandLineScrollTop = output.scrollTop() + 20;
    $('#commandLineBorder').removeClass('show-vertical-scroll');
  }
}

function showCommandLineOutput() {
  var output = $('#commandLineOutput');
  if (!output.is(':visible') && $('#lockCommandButton').hasClass('disabled')) {
    output.slideDown(function () {
      output.scrollTop(commandLineScrollTop);
      resizeApp();
    });
    $('#commandLineBorder').addClass('show-vertical-scroll');
  }
}

function loadCommandLine() {
  $('#commandLine').click(function () {
    showCommandLineOutput();
  });
  $('#commandLineContainer').click(function (e) {
    e.stopPropagation();
  });
  $(window).click(function () {
    hideCommandLineOutput();
  });

  var readline = require("readline");
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
      $.post('/apiv1/exec', { cmd: line }, function (data, status) {
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
    }
  });
}

function escapeHtml(str) {
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
    $.get('/apiv1/keys/' + partial + '*?limit=20', function (data, status) {
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
function resizeApp() {
  var barWidth = $('#keyTree').outerWidth(true);
  $('#sideBar').css('width', barWidth);
  var bodyMargin = parseInt($('#body').css('margin-left'), 10);
  var newBodyWidth = $(window).width() - barWidth - bodyMargin;
  $('#body,#itemActionsBar').css('width', newBodyWidth);
  $('#body,#itemActionsBar').css('left', barWidth);

  $('#keyTree').height($(window).height() - $('#keyTree').offset().top - $('#commandLineContainer').outerHeight(true));
  $('#body, #sidebarResize').css('height', $('#sideBar').css('height'));
}
function setupResizeEvents() {
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
function setupCommandLock() {
  $('#lockCommandButton').click(function () {
    $(this).toggleClass('disabled');
  });
}

function setupCLIKeyEvents() {
  var ctrl_down = false;
  var isMac = navigator.appVersion.indexOf("Mac")!=-1;
  var cli = $('#_readline_cliForm input');
  cli.live('keydown',function (e){
    var key = e.which;
    //ctrl
    if(key == 17 && isMac){
      ctrl_down = true;
    }

    //c
    if(key == 67 && ctrl_down){
      clearCLI ();
      e.preventDefault();
    }

    //esc
    if(key == 27){
      clearCLI ();
      e.preventDefault();
    }
  });
  cli.live('keyup',function (e){
    var key = e.which;
    //ctrl
    if(key == 17 && isMac){
      ctrl_down = false;
    }
  });

function clearCLI (){
  var cli = $('#_readline_cliForm input');
  if(cli.val() == ''){
    hideCommandLineOutput();
  }else{
    cli.val('');
  }
}

}

'use strict';

var CmdParser = require('cmdparser');
var cmdparser;

function loadTree () {
  $.get('apiv2/connection', function (isConnected) {
    if (isConnected) {
      $('#keyTree').on('loaded.jstree', function () {
        var tree = getKeyTree();
        if (tree) {
          var root = tree.get_container().children("ul:eq(0)").children("li");
          tree.open_node(root, null, true);
        }
      });
      //getServerInfo(function (data) {
      $.get('connections', function (data) {
        var json_dataData = [];

        if (data.connections) {
          data.connections.every(function (instance) {
            // build root objects for jsontree
            var treeObj = {
              id: instance.options.host + ":" + instance.options.port + ":" + instance.options.db,
              text: instance.label + " (" + instance.options.host + ":" + instance.options.port + ":" + instance.options.db + ")",
              state: {opened: false},
              icon: getIconForType('root'),
              children: true,
              rel: "root"
            };
            json_dataData.push(treeObj);
            return true;
         });
        }
        return onJSONDataComplete();

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
                      if (redisReadOnly) {
                          delete menu['addKey'];
                          delete menu['remKey'];
                      }
                      return menu;
                  }
              },
              plugins: [ "themes", "contextmenu" ]
          })
          .on('select_node.jstree', treeNodeSelected)
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
      data.some(function (instance) {
        if (instance.host == hostAndPort[0] && instance.port == hostAndPort[1] && instance.db == hostAndPort[2]) {
          instance.connectionId = connectionId;
          if (!instance.disabled) {
            renderEjs('templates/serverInfo.ejs', instance, $('#body'), setupAddKeyButton);
          }
          else {
            var html = '<div>ERROR: ' + (instance.error ? instance.error : 'Server not available - cannot query status informations.') + '</div>';
            $('#body').html(html);
            setupAddKeyButton();
          }
          return true;
        }
        return false;
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
        resizeApp();
        break;
    }
  }
}

function selectTreeNodeBranch (data) {
  renderEjs('templates/editBranch.ejs', data, $('#body'));
}

function setupEditDataModals(idForm, idSaveBtn) {
  $('#' + idForm).off('submit').on('submit', function(event) {
    console.log('saving');
    event.preventDefault();
    var editForm = $(event.target);
    var editModal = editForm.closest('.modal');
    editModal.find('#' + idSaveBtn).button('loading');

    $.post(editForm.attr('action'), editForm.serialize()
    ).done(function (data, status) {
      console.log('saved', arguments);
    })
    .fail(function (err) {
      console.log('save error', arguments);
      alert("Could not save '" + err.statusText + "'");
    })
    .always(function () {
      setTimeout(function () {
        refreshTree();
        getKeyTree().select_node(0);
        editModal.find('#' + idSaveBtn).button('reset');
        editModal.modal('hide');
      }, 500);
    });
  });
}

function setupJsonInputValidator(idJsonCheckbox, idInput) {
  var chkBox = $('#' + idJsonCheckbox);
  chkBox.on('change', function(element) {
    if (element.target.checked) addInputValidator(idInput, 'json');
    else removeInputValidator(idInput);
  });
  chkBox.closest('.modal').on('hidden', function() {
    removeInputValidator(idInput);
    chkBox.prop('checked', false);
  })
}

function setupAddKeyButton (connectionId) {
  var newKeyModal = $('#addKeyModal');
  newKeyModal.find('#newStringValue').val('');
  newKeyModal.find('#newFieldName').val('');
  newKeyModal.find('#keyScore').val('');
  newKeyModal.find('#addKeyConnectionId').val(connectionId);
  newKeyModal.find('#addKeyIsJson').prop('checked', false);
  newKeyModal.find('#keyType').change(function () {
    var score = newKeyModal.find('#scoreWrap');
    if ($(this).val() === 'zset') {
      score.show();
    } else {
      score.hide();
    }
    var field = newKeyModal.find('#fieldWrap');
    if ($(this).val() === 'hash') {
      field.show();
    } else {
      field.hide();
    }
  });
}

function addNewKey() {
  var newKeyModal = $('#addKeyModal');
  var newKey = newKeyModal.find('#keyValue').val();
  var connectionId = newKeyModal.find('#addKeyConnectionId').val();
  var action = "apiv2/key/" + encodeURIComponent(connectionId) + "/" + encodeURIComponent(newKey);
  console.log('saving new key ' + newKey);
  newKeyModal.find('#saveKeyButton').attr("disabled", "disabled").html("<i class='icon-refresh'></i> Saving");

  $.ajax({
    url: action,
    method: 'POST',
    data: newKeyModal.find('#addKeyForm').serialize()
  }).done(function() {
    console.log('saved new key ' + newKey + ' at ' + connectionId);
  }).fail(function(jqXHR, textStatus, errorThrown) {
    console.log('save error for key ' + newKey + ': ' + textStatus);
    alert("Could not save '" + errorThrown.statusText + "'");
  }).always(function() {
    setTimeout(function () {
      newKeyModal.find('#saveKeyButton').removeAttr("disabled").html("Save");
      refreshTree();
      newKeyModal.modal('hide');
    }, 500);
  });
}

function selectTreeNodeString (data) {
  renderEjs('templates/editString.ejs', data, $('#body'), function() {
    var isJsonParsed = false;
    try {
      JSON.parse(data.value);
      isJsonParsed = true;
    } catch (ex) {
      $('#isJson').prop('checked', false);
    }

    $('#stringValue').val(data.value);
    // a this is json now assume it shall be json if it is object or array, but not for numbers
    if (isJsonParsed && data.value.match(/^\s*[{\[]/)) {
      $('#isJson').click();
    }

    try {
      $('#jqtree_string_div').html(JSONTree.create(JSON.parse(data.value)));
    } catch (err) {
      $('#jqtree_string_div').text('Text is no valid JSON: ' + err.message);
    }

    if (!redisReadOnly) {
      $('#editStringForm').off('submit').on('submit', function(event) {
        console.log('saving');
        event.preventDefault();
        var editForm = $(event.target);
        $('#saveKeyButton').attr("disabled", "disabled").html("<i class='icon-refresh'></i> Saving");

        $.post(editForm.attr('action'), editForm.serialize()
        ).done(function(data, status) {
          console.log('saved', arguments);
          refreshTree();
          getKeyTree().select_node(0);
        })
        .fail(function(err) {
          console.log('save error', arguments);
          alert("Could not save '" + err.statusText + "'");
        })
        .always(function() {
          setTimeout(function() {
            $('#saveKeyButton').removeAttr("disabled").html("Save");
          }, 500);
        });
      });
    }
  });
}

function selectTreeNodeHash (data) {
  renderEjs('templates/editHash.ejs', data, $('#body'), function() {
    console.log('edit hash template rendered');
  });
}

function selectTreeNodeSet (data) {
  renderEjs('templates/editSet.ejs', data, $('#body'), function() {
    console.debug('edit set template rendered');
  });
}

function selectTreeNodeList (data) {
  if (data.items.length > 0) {
    renderEjs('templates/editList.ejs', data, $('#body'), function() {
      console.log('edit list template rendered');
    });
  } else {
    alert('Index out of bounds');
  }
}

function selectTreeNodeZSet (data) {
  if (data.items.length > 0) {
    renderEjs('templates/editZSet.ejs', data, $('#body'), function() {
      console.log('rendered zset template');
    });
  } else {
    alert('Index out of bounds');
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
  // context menu or DEL key pressed on folder item
  if (key.endsWith(foldingCharacter)) {
    deleteBranch(connectionId, key);
    return;
  }
  // delete this specific key only, no wildcard here
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
    if (value.match(/^\s*[{\[]/)) {
      $(isJsonCheckBox).click();
    }
  }
  catch (ex) {
    // do nothing
  }
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
var cliOpen = false;

function hideCommandLineOutput () {
  var output = $('#commandLineOutput');
  if (output.is(':visible') && $('#lockCommandButton').hasClass('disabled')) {
    output.slideUp(function () {
      resizeApp();
      configChange();
    });
    cliOpen = false;
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
    cliOpen = true;
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

/** Fetch the url give at filename from the server and render the content of this
 *  template with the data object. Afterwards the rendered html is added at the
 *  html element given.
 *
 * @param {string} filename url to retrieve as template
 * @param {object} data object to use for rendering
 * @param {object} element jquery html element to attach rendered data to
 * @param {function} [callback] optional function to call when rendering html is attached to dom
 */
function renderEjs(filename, data, element, callback) {
  $.get(filename)
    .done(function(htmlTmpl) {
      element.html(ejs.render(htmlTmpl, data));
    })
    .fail(function(error) {
      console.log('failed to get html template ' + filename + ': ' + JSON.stringify(error));
      alert('failed to fetch html template ' + filename);
    })
    .always(function () {
      if (typeof callback === 'function') callback();
      resizeApp();
    });
}

var configTimer;
var prevSidebarWidth;
var prevLocked;
var prevCliHeight;
var prevCliOpen;
var configLoaded = false;


function initCmdParser() {
  let parserOpts = {
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
  };

  $.get('apiv2/redisCommands')
  .done(function(cmds) {
    cmdparser = new CmdParser(cmds.list, parserOpts);
  })
  .fail(function(error) {
    console.log('failed to load list of supported redis commands, cannot init CmdParser: ' + JSON.stringify(error));
    cmdparser = new CmdParser([], parserOpts);
  });
}

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
      $(window).off('beforeunload', 'clearStorage');
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
    var cliHeight = $('#commandLineContainer').height();

    if (typeof(prevSidebarWidth) !== 'undefined' &&
      (sidebarWidth != prevSidebarWidth || locked != prevLocked ||
       cliHeight != prevCliHeight || cliOpen != prevCliOpen)) {
      clearTimeout(configTimer);
      configTimer = setTimeout(saveConfig, 2000);
    }
    prevSidebarWidth = sidebarWidth;
    prevLocked = locked;
    prevCliHeight = cliHeight;
    prevCliOpen = cliOpen;
  } else {
    configLoaded = false;
  }
}

function saveConfig () {
  // deprecated - not used anymore
}

function loadConfig (callback) {
  $.get('config', function (data) {
    if (data) {
      if (data['sidebarWidth']) {
        $('#sideBar').width(data['sidebarWidth']);
      }
      if (data['cliOpen'] == "true") {
        $('#commandLineOutput').slideDown(0, function () {
          if (data['cliHeight']) {
            $('#commandLineOutput').height(data['cliHeight']);
          }
        });
        cliOpen = true;
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

  $('#keyTree').on('resize', resizeApp);
  $(window).on('resize', resizeApp);

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
  var isMac = navigator.appVersion.indexOf("Mac") !== -1;
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
   * Show export form.
   */
  $('#redisExportData').on('click', function () {
    $.ajax({
      method: 'POST',
      url: 'tools/forms/export',
      success: function (res) {
        $('#body').html(res);
      }
    });
  });

  /**
   * Import redis data.
   */
  if (!redisReadOnly) {
    $('#app-container').on('submit', '#redisImportForm', function() {
      $('#body').html('<h2>Import</h2>Importing in progress. Prease wait...');

      $.ajax({
        method: 'POST',
        url: 'tools/import',
        data: $(this).serialize() + '&redisCommanderQueryToken=' + encodeURIComponent(sessionStorage.getItem('redisCommanderQueryToken') || ''),
        dataType: 'json',
        success: function(res) {
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
        method: 'POST',
        url: 'tools/forms/import',
        success: function (res) {
          $('#body').html(res);
        }
      });
    });
  }


  /**
   * Refresh and expand all nodes in tree
   */
  $('#expandAllNodes').on('click', function () {
    refreshTree();
    $('#keyTree').jstree('open_all');
  });
});


/// IE11 polyfills
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(search, this_len) {
    if (this_len === undefined || this_len > this.length) {
      this_len = this.length;
    }
    return this.substring(this_len - search.length, this_len) === search;
  };
}

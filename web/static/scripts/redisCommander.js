'use strict';

var CmdParser = require('cmdparser');
var cmdparser;
var losslessJSON = require('lossless-json');
var simpleObjRE = /^\s*[{\[]/;

function loadTree () {
  $.get('apiv2/connection', function (isConnected) {
    if (isConnected) {
      $('#keyTree').on('loaded.jstree', function () {
        var tree = getKeyTree();
        if (tree) {
          var root = tree.get_container().children('ul:eq(0)').children('li');
          tree.open_node(root, null, true);
        }
      });
      $.get('connections', function (data) {
        var json_dataData = [];

        if (data.connections) {
          data.connections.every(function (instance) {
            // build root objects for jstree view on left side
            var treeObj = {
              id: instance.conId,
              text: instance.label + ' (' + instance.options.host + ':' + instance.options.port + ':' + instance.options.db + ')',
              state: {opened: false},
              icon: getIconForType('root'),
              children: true,
              rel: 'root'
            };
            json_dataData.push(treeObj);
            return true;
         });
        }
        return onJSTreeDataComplete();

        function getJsTreeData(node, cb) {
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
            if (Array.isArray(nodeData.data)) {
              nodeData.data.forEach(function(elem) {
                 if (elem.rel) elem.icon = getIconForType(elem.rel);
              });
            }
            cb(nodeData.data)
          }).fail(function(error) {
            console.log('Error fetching data for node ' + node.id + ': ' + JSON.stringify(error));
            if (error.responseJSON && error.responseJSON.connectionClosed) {
              setRootConnectionNetworkError(true, node)
            }
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
              case 'stream': return 'images/treeStream.png';
              case 'binary': return 'images/treeBinary.png';
              case 'ReJSON-RL': return 'images/treeJson.png';
              default: return null;
          }
        }

        function onJSTreeDataComplete () {
          $('#keyTree').jstree({
              core: {
                  data: getJsTreeData,
                  multiple : false,
                  check_callback : true,
                  //themes: {
                  //    responsive: true
                  //}
              },
              contextmenu: {
                  items: function (node) {
                      var menu = {
                          'renameKey': {
                            icon: './images/icon-edit.png',
                            label: 'Rename Key',
                            action: renameKey
                          },
                          'addKey': {
                            icon: './images/icon-plus.png',
                            label: 'Add Key',
                            action: addKey
                          },
                          'refresh': {
                            icon: './images/icon-refresh.png',
                            label: 'Refresh',
                            action: function (obj) {
                                jQuery.jstree.reference('#keyTree').refresh(obj);
                            }
                          },
                          'export': {
                            icon: './images/icon-download.png',
                            label: 'Export Keys',
                            action: exportKey
                          },
                          'remKey': {
                            icon: './images/icon-trash.png',
                            label: 'Remove Key',
                            action: deleteKey
                          },
                          'remConnection': {
                            icon: './images/icon-trash.png',
                            label: 'Disconnect',
                            action: removeServer
                          }
                      };
                      var rel = node.original.rel;
                      if (typeof rel === 'undefined' ) {    // folder
                        delete menu['renameKey'];
                      }
                      if (typeof rel !== 'undefined' && rel !== 'root') {  // some redis key
                        delete menu['addKey'];
                      }
                      if (rel !== 'root') {
                        delete menu['remConnection'];
                      }
                      if (rel === 'root') {     // root connection object (first level in tree-view)
                        delete menu['renameKey'];
                        delete menu['remKey'];
                      }
                      if (redisReadOnly) {
                        delete menu['renameKey'];
                        delete menu['addKey'];
                        delete menu['remKey'];
                      }
                      return menu;
                  }
              },
              plugins: [ 'themes', 'contextmenu' ]
          })
          .on('select_node.jstree', treeNodeSelected)
          .delegate('a', 'click', function (event, data2) {
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
    $.get('apiv2/server/' + connectionId + '/info')
        .done(function (infoData, status) {
          if (status !== 'success') {
            return alert('Could not load server info');
          }
          if (typeof infoData === 'string') infoData = JSON.parse(infoData);
          infoData.data.some(function (instance) {
            if (instance.connectionId === connectionId) {
              if (!instance.disabled) {
                setRootConnectionNetworkError(false, data.node);
                renderEjs('templates/serverInfo.ejs', instance, $('#body'), setupAddKeyButton);
              }
              else {
                setRootConnectionNetworkError(true, data.node);
                var html = '<h5>ERROR: ' + (instance.error ? instance.error : 'Server not available - cannot query status information.') + '</h5>';
                $('#body').html(html);
                setupAddKeyButton();
              }
              return true;
            }
            return false;
          });
        })
        .fail(function (error) {
          if (error.responseJSON) {
            if (error.responseJSON.message) {
              $('#body').html('<h5>Got ERROR: ' + error.responseJSON + '</h5>');
            }
            else {
              $('#body').html('<h5>Network ERROR calling server...</h5>');
            }
            if (error.responseJSON.connectionClosed) setRootConnectionNetworkError(true, data.node);
          }
        });
  } else {
    connectionId = getRootConnection(data.node);
    var path = getFullKeyPath(data.node);
    return loadKey(connectionId, path);
  }
}

/** finds root entry with connection object of the node given and changes icon to show disconnect state
 *
 *  @param hasError flag to indicate a connection problem on a tree node
 *  @param node JSTree node the error occurred to get first sibling from tree root
 */
function setRootConnectionNetworkError (hasError, node) {
  var tree = getKeyTree();
  var root = getRootConnection(node);
  var rootNode = tree.get_node(root);
  if (hasError) tree.set_icon(rootNode, 'images/treeRootDisconnect.png');
  else if (tree.get_icon(rootNode) === 'images/treeRootDisconnect.png') {
    // only set icon if not already set to minimize redraws here...
    tree.set_icon(rootNode, 'images/treeRoot.png');
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
    $.get('apiv2/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(key) + '?index=' + index)
        .done(processData)
        .fail(errorHandler);
  } else {
    $.get('apiv2/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(key))
        .done(processData)
        .fail(errorHandler)
  }

  function processData (keyData, status) {
    if (status !== 'success') {
      return alert('Could not load key data');
    }

    setRootConnectionNetworkError(false, getKeyTree().get_selected(true)[0]);
    if (typeof keyData === 'string') keyData = JSON.parse(keyData);
    keyData.connectionId = connectionId;
    console.log('rendering type ' + keyData.type);
    switch (keyData.type) {
      case 'string':
        selectTreeNodeString(keyData);
        break;
      case 'hash':
        selectTreeNodeHash(keyData);
        break;
      case 'set':
        selectTreeNodeSet(keyData);
        break;
      case 'list':
        selectTreeNodeList(keyData);
        break;
      case 'zset':
        selectTreeNodeZSet(keyData);
        break;
      case 'stream':
        selectTreeNodeStream(keyData);
        break;
      case 'binary':
        selectTreeNodeBinary(keyData);
        break;
      case 'ReJSON-RL':
        selectTreeNodeReJSON(keyData);
        break;
      case 'none':
        selectTreeNodeBranch(keyData);
        break;
      default:
        var html = JSON.stringify(keyData);
        $('#body').html(html);
        resizeApp();
        break;
    }
  }

  function errorHandler(error) {
    if (error.responseJSON) {
      if (error.responseJSON.message) {
        $('#body').html('<h5>Got ERROR: ' + error.responseJSON.message + '</h5>');
      }
      else {
        $('#body').html('<h5>Network ERROR calling server...</h5>');
      }
      if (error.responseJSON.connectionClosed) setRootConnectionNetworkError(true, getKeyTree().get_selected(true)[0]);
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
      alert('Could not save "' + err.statusText + '"');
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

function registerModalFocus(idModal, idInput) {
  var modal = $('#' + idModal);
  modal.on('shown', function () {
    modal.find('#' + idInput).trigger('focus')
  });
}

function setupAddServerForm() {
  var serverModal = $('#addServerModal');

  // register add server form as ajax form to send bearer token too
  $('#addServerForm').off('submit').on('submit', function (event) {
    console.log('try connection to new redis server');
    event.preventDefault();
    $('#addServerBtn').prop('disabled', true).html('<i class="icon-refresh"></i> Saving');
    var form = $(event.target);
    $.post(form.attr('action'), form.serialize())
        .done(function () {
          if (arguments[0] && arguments[0].ok) {
            console.log('Connect successful');
            setTimeout(function() {
              $(window).off('beforeunload', 'clearStorage');
              location.reload();
            }, 500);
          }
          else {
            addServerError(arguments[0] ? arguments[0].message : 'Server error processing request');
          }
        })
        .fail(function (err) {
          console.log('connect error: ', arguments);
          addServerError(err.statusText);
        })
        .always(function() {
          $('#addServerBtn').prop('disabled', false).text('Connect...');
        })
  });

  function addServerError(errMsg) {
    alert('Could not connect to redis server "' + errMsg + '"');
    serverModal.modal('hide');
  }

  // prepare all input elements
  serverModal.find('#addServerGroupSentinel').hide();
  serverModal.find('#serverType').on('change', function () {
    if ($(this).val() === 'redis') {
      serverModal.find('#addServerGroupRedis').show();
      serverModal.find('#addServerGroupSentinel').hide();
    } else {
      serverModal.find('#addServerGroupRedis').hide();
      serverModal.find('#addServerGroupSentinel').show();
    }
  });
  serverModal.find('input:radio[name=sentinelPWType]').on('change', function() {
    if ($(this).val() === 'sentinel') {
      serverModal.find('#sentinelPassword').prop('disabled', false)
        .prev('label').removeClass('muted');
    }
    else {
      serverModal.find('#sentinelPassword').prop('disabled', true)
        .prev('label').addClass('muted');
    }
  });
  serverModal.find('#label').trigger('focus');
}

function setupAddKeyButton (connectionId) {
  var newKeyModal = $('#addKeyModal');
  newKeyModal.find('#newStringValue').val('');
  newKeyModal.find('#newFieldName').val('');
  newKeyModal.find('#keyScore').val('');
  newKeyModal.find('#addKeyConnectionId').val(connectionId);
  newKeyModal.find('#addKeyValueIsJson').prop('checked', false);
  newKeyModal.find('#addKeyFieldIsJson').prop('checked', false);
  newKeyModal.find('#keyType').on('change', function () {
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
    var fieldValue = newKeyModal.find('#fieldValueWrap');
    var timestamp = newKeyModal.find('#timestampWrap');
    if ($(this).val() === 'stream') {
      fieldValue.show();
      timestamp.show();
    } else {
      fieldValue.hide();
      timestamp.hide();
    }
  });
}

function addNewKey() {
  var newKeyModal = $('#addKeyModal');
  var newKey = newKeyModal.find('#keyValue').val();
  var connectionId = newKeyModal.find('#addKeyConnectionId').val();
  var action = 'apiv2/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(newKey);
  console.log('saving new key ' + newKey);
  newKeyModal.find('#saveKeyButton').attr('disabled', 'disabled').html('<i class="icon-refresh"></i> Saving');

  $.ajax({
    url: action,
    method: 'POST',
    data: newKeyModal.find('#addKeyForm').serialize()
  }).done(function() {
    console.log('saved new key ' + newKey + ' at ' + connectionId);
  }).fail(function(jqXHR, textStatus, errorThrown) {
    console.log('save error for key ' + newKey + ': ' + textStatus);
    alert('Could not save "' + errorThrown.statusText + '"');
  }).always(function() {
    setTimeout(function () {
      newKeyModal.find('#saveKeyButton').prop('disabled', false).html('Save');
      refreshTree();
      newKeyModal.modal('hide');
    }, 500);
  });
}


function renameExistingKey() {
  var modal = $('#renameKeyModal');
  var oldKey = modal.find('#currentKeyName').val();
  var newKey = modal.find('#renamedKeyName').val();
  var connectionId = modal.find('#renameKeyConnectionId').val();
  var action = 'apiv2/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(oldKey);
  console.log('renaming ' + oldKey + ' to new key ' + newKey);
  modal.find('#renameKeyButton').attr('disabled', 'disabled').html('<i class="icon-refresh"></i> Saving');

  $.ajax({
    url: action,
    method: 'POST',
    data: {key: newKey, force: modal.find('#forceRenameKey').is(':checked'), action: 'patch'}
  }).done(function() {
    console.log('renamed old key ' + newKey + ' at ' + connectionId);
  }).fail(function(jqXHR, textStatus, errorThrown) {
    console.log('rename error for key ' + oldKey + ': ' + textStatus);
    alert('Could not rename "' + errorThrown + '" (HTTP ' + jqXHR.status + ')');
  }).always(function(data, textStatus) {
    // close modal for most return values incl. success
    // but stay open if error message returned (key exists without overwrite)
    if (textStatus === 'success' && data.error && data.error.code === 'ERR_KEY_EXISTS') {
      modal.find('#renamedKeyName').after('<span class="text-error">' + data.error.title + '</span>')
        .closest('.control-group').addClass('error');
    }
    else {
      setTimeout(function() {
        refreshTree();
        modal.modal('hide');
      }, 500);
    }
    modal.find('#renameKeyButton').prop('disabled', false).html('Save');
  });
}


function selectTreeNodeString (data) {
  renderEjs('templates/editString.ejs', data, $('#body'), function() {
    var isJsonParsed = false;
    try {
      var jsonObject = data.value;
      if (jsonObject.match(simpleObjRE)) {
        jsonObject = losslessJSON.parse(data.value, losslessJsonReviver);
        isJsonParsed = true;
      }
      $('#jqtree_string_div').jsonViewer(jsonObject, {withQuotes: true, withLinks: false});
      if ((uiConfig.jsonViewAsDefault & uiConfig.const.jsonViewString) > 0) dataUIFuncs.onModeJsonButtonClick('#editStringForm')
    } catch (ex) {
      $('#isJson').prop('checked', false);
      $('#jqtree_string_div').text('Text is no valid JSON: ' + ex.message);
    }

    $('#stringValue').val(data.value);
    // a this is json now assume it shall be json if it is object or array, but not for numbers
    if (isJsonParsed && data.value.match(simpleObjRE)) {
      $('#isJson').trigger('click');
    }

    if (!redisReadOnly) {
      $('#editStringForm').off('submit').on('submit', function(event) {
        console.log('saving');
        event.preventDefault();
        var editForm = $(event.target);
        $('#saveKeyButton').attr('disabled', 'disabled').html('<i class="icon-refresh"></i> Saving');

        $.post(editForm.attr('action'), editForm.serialize()
        ).done(function(data2, status) {
          console.log('saved', arguments);
          refreshTree();
          getKeyTree().select_node(0);
        })
        .fail(function(err) {
          console.log('save error', arguments);
          alert('Could not save "' + err.statusText + '"');
        })
        .always(function() {
          setTimeout(function() {
            $('#saveKeyButton').prop('disabled', false).html('Save');
          }, 500);
        });
      });
    }
  });
}

function selectTreeNodeBinary (data) {
  // switch image from 'string' to 'binary', do not know this before really querying the value...
  var tree = getKeyTree();
  tree.set_icon(tree.get_selected(true)[0], 'images/treeBinary.png');

  // only working for smaller data sets, no big binaries by now (everything load into browser)...
  // calc number of 8bit-columns based on current "#body".width, static widths are taken from css classes
  // TODO handle window resize
  var idBody = $('#body');
  data.offset = 0;
  data.columns = Math.floor( (idBody.width() - 70 - 2*20) / 34 / 8 ) * 8;
  data.value = BinaryView.base64DecToArr(data.value);
  data.positions = [];
  for (var i = 0; i < Math.ceil(data.value.length / data.columns); i += 1) {
    data.positions.push( BinaryView.toHex(data.offset + i * data.columns, 8) );
  }

  renderEjs('templates/editBinary.ejs', data, idBody, function() {
    console.log('edit binary template rendered');
    idBody.find('.binaryView-hex').width(22 * data.columns);
    idBody.find('.binaryView-char').width(12 * data.columns);
  });
}

function selectTreeNodeHash (data) {
  renderEjs('templates/editHash.ejs', data, $('#body'), function() {
    console.log('edit hash template rendered');
    if ((uiConfig.jsonViewAsDefault & uiConfig.const.jsonViewHash) > 0) dataUIFuncs.onModeJsonButtonClick()
  });
}

function selectTreeNodeSet (data) {
  renderEjs('templates/editSet.ejs', data, $('#body'), function() {
    console.debug('edit set template rendered');
    if ((uiConfig.jsonViewAsDefault & uiConfig.const.jsonViewSet) > 0) dataUIFuncs.onModeJsonButtonClick()
  });
}

function selectTreeNodeList (data) {
  if (data.items.length > 0) {
    renderEjs('templates/editList.ejs', data, $('#body'), function() {
      console.log('edit list template rendered');
      if ((uiConfig.jsonViewAsDefault & uiConfig.const.jsonViewList) > 0) dataUIFuncs.onModeJsonButtonClick()
    });
  } else {
    alert('Index out of bounds');
  }
}

function selectTreeNodeZSet (data) {
  if (data.items.length > 0) {
    renderEjs('templates/editZSet.ejs', data, $('#body'), function() {
      console.log('rendered zset template');
      if ((uiConfig.jsonViewAsDefault & uiConfig.const.jsonViewZSet) > 0) dataUIFuncs.onModeJsonButtonClick()
    });
  } else {
    alert('Index out of bounds');
  }
}

function selectTreeNodeStream (data) {
  renderEjs('templates/editStream.ejs', data, $('#body'), function() {
    console.log('rendered stream template');
  });
}

function selectTreeNodeReJSON(data) {
  renderEjs('templates/viewReJSON.ejs', data, $('#body'), function() {
    console.log('rendered ReJSON template')
  });
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

function renameKey (connectionId, key) {
  if (typeof(connectionId) === 'object') {
    // context menu click
    var node = getKeyTree().get_node(connectionId.reference[0]);
    key = getFullKeyPath(node);
    connectionId = getRootConnection(node);
  }
  var modal = $('#renameKeyModal');
  modal.find('#currentKeyName').val(key);
  modal.find('#currentKeyNameDisplay').text(key);
  modal.find('#renamedKeyName').val(key);
  modal.find('#renameKeyConnectionId').val(connectionId);
  modal.find('#forceRenameKey').prop('checked', false);
  modal.find('.text-error').remove();
  modal.find('#renamedKeyName').closest('.control-group').removeClass('error');
  modal.modal('show');
}

function exportKey (connectionId, key) {
  var node = null;
  if (typeof (connectionId) === 'object') {
    // context menu click
    node = getKeyTree().get_node(connectionId.reference[0]);
    key = getFullKeyPath(node);
    connectionId = getRootConnection(node);
  }
  $.ajax({
    method: 'GET',
    url: 'tools/forms/export',
    success: function (res) {
      var body = $('#body')
      body.html(res);
      body.find('#connectionExportField option[value="' + connectionId + '"]').attr('selected', true);
      body.find('#exportKeyPrefix').val(key);
    }
  });
}

function deleteKey (connectionId, key) {
  var node = null;
  if (typeof(connectionId) === 'object') {
      // context menu click
      node = getKeyTree().get_node(connectionId.reference[0]);
      key = getFullKeyPath(node);
      connectionId = getRootConnection(node);
  }
  node = getKeyTree().get_node(connectionId);

  // context menu or DEL key pressed on folder item
  if (key.endsWith(foldingCharacter)) {
    deleteBranch(connectionId, key);
    return;
  }
  // delete this specific key only, no wildcard here
  var result = confirm('Are you sure you want to delete "' + key + '" from "' + node.text + '"?');
  if (result) {
    $.post('apiv2/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(key) + '?action=delete', function (data, status) {
      if (status !== 'success') {
        return alert('Could not delete key');
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
      return alert('Could not decode key');
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
      return alert('Could not encode key');
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
  var node = getKeyTree().get_node(connectionId);
  var query = (branchPrefix.endsWith(foldingCharacter) ? branchPrefix : branchPrefix + foldingCharacter) + '*';
  var result = confirm('Are you sure you want to delete "' + query + '" from "' + node.text + '"? This will delete all children as well!');
  if (result) {
    $.post('apiv2/keys/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(query) + '?action=delete', function (data, status) {
      if (status !== 'success') {
        return alert('Could not delete branch');
      }

      refreshTree();
      getKeyTree().select_node(-1);
      $('#body').html('');
    });
  }
}
function addListValue (connectionId, key) {
  $('#key').val(key);
  $('#addListValue').val('');
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
  $('#addSetMemberName').val('');
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
    $('#addZSetScore').val('');
    $('#addZSetMemberName').val('');
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

function addXSetMember (connectionId, key) {
  $('#addXSetKey').val(key);
  $('#addXSetTimestamp').val(Date.now()+'-0');
  $('#addXSetField').val('');
  $('#addXSetValue').val('');
  $('#addXSetConnectionId').val(connectionId);
  $('#addXSetMemberModal').modal('show');
}

function addHashField (connectionId, key) {
    $('#addHashKey').val(key);
    $('#addHashFieldName').val('');
    $('#addHashFieldValue').val('');
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

function showHashField (connectionId, key, field) {
  $.get('apiv2/hash/key/' + encodeURIComponent(connectionId) + '/' + encodeURIComponent(key) + '?field=' + encodeURIComponent(field))
      .done(processData)
      .fail(errorHandler)

  function processData (keyData, status) {
    if (status !== 'success') {
      return alert('Could not load key data');
    }
    if (typeof keyData === 'string') keyData = JSON.parse(keyData);

    var deferredRow = $('tr[data-deferred-field="' + field + '"');
    if (deferredRow) {
      // inject the data into the view
      deferredRow.find('td.text-renderer').text(keyData.data);

      // regenerate the json view
      dataUIFuncs.createJSONViews(deferredRow.find('td.json-renderer'));

      // remove the deferred attribute so the value is editable
      deferredRow.removeAttr('data-deferred-field');
    }
  }

  function errorHandler(error) {
    if (error.responseJSON) {
      if (error.responseJSON.message) {
        $('#body').html('<h5>Got ERROR: ' + error.responseJSON.message + '</h5>');
      }
      else {
        $('#body').html('<h5>Network ERROR calling server...</h5>');
      }
      if (error.responseJSON.connectionClosed) setRootConnectionNetworkError(true, getKeyTree().get_selected(true)[0]);
    }
  }
}

/** check if given string value is valid json and, if so enable validation
 *  for given field if this is an json object or array. Do not automatically
 *  enable validation on numbers or quoted strings. May be coincidence that this is json...
 *
 *  @param {string} value string to check if valid json
 *  @param {string} isJsonCheckBox id string of checkbox element to activate validation
 */
function enableJsonValidationCheck(value, isJsonCheckBox) {
  try {
    // can use normal json.parse here as some bigint values changing are not relevant
    JSON.parse(value);
    // if this is valid json and is array or object assume we want validation active
    if (value.match(simpleObjRE)) {
      $(isJsonCheckBox).trigger('click');
    }
  }
  catch (ex) {
    // do nothing
  }
}

function removeListElement () {
  $('#listValue').val('REDISCOMMANDERTOMBSTONE');
  $('#editListValueForm').trigger('submit');
}

function removeSetElement () {
  $('#setMember').val('REDISCOMMANDERTOMBSTONE');
  $('#editSetMemberForm').trigger('submit');
}

function removeZSetElement () {
  $('#zSetValue').val('REDISCOMMANDERTOMBSTONE');
  $('#editZSetMemberForm').trigger('submit');
}

function removeHashField () {
  $('#hashFieldValue').val('REDISCOMMANDERTOMBSTONE');
  $('#editHashFieldForm').trigger('submit');
}

function removeXSetElement (connectionId, key, timestamp) {
  $.ajax({
    url: 'apiv2/xset/member',
    method: 'DELETE',
    data: {
      connectionId: connectionId,
      key: key,
      timestamp: timestamp
    }
  }).done(function(data, status) {
    console.log('entry at timestamp ' + timestamp + ' deleted');
    refreshTree();
    getKeyTree().select_node(0);
  })
  .fail(function(err) {
    console.log('delete stream entry error', arguments);
    alert('Could not delete stream member at timestamp ' + timestamp + ': ' + err.statusText);
  });
}

var redisCli = {
  commandLineScrollTop: 0,
  cliOpen: false,

  hideCommandLineOutput: function hideCommandLineOutput() {
    var output = $('#commandLineOutput');
    if (output.is(':visible') && $('#lockCommandButton').hasClass('disabled')) {
      output.slideUp(function() {
        resizeApp();
      });
      redisCli.cliOpen = false;
      redisCli.commandLineScrollTop = output.scrollTop() + 20;
      $('#commandLineBorder').removeClass('show-vertical-scroll');
    }
  },

  showCommandLineOutput: function showCommandLineOutput() {
    var output = $('#commandLineOutput');
    if (!output.is(':visible') && $('#lockCommandButton').hasClass('disabled')) {
      output.slideDown(function() {
        output.scrollTop(redisCli.commandLineScrollTop);
        resizeApp();
      });
      redisCli.cliOpen = true;
      $('#commandLineBorder').addClass('show-vertical-scroll');
    }
  },

  loadCommandLine: function loadCommandLine() {
    $('#commandLine').on('click', function() {
      redisCli.showCommandLineOutput();
    });
    $('#app-container').on('click', function() {
      redisCli.hideCommandLineOutput();
    });

    var readline = require('readline-browserify');
    var output = document.getElementById('commandLineOutput');
    var rl = readline.createInterface({
      elementId: 'commandLine',
      write: function(data) {
        if (output.innerHTML.length > 0) {
          output.innerHTML += '<br>';
        }
        output.innerHTML += escapeHtml(data);
        output.scrollTop = output.scrollHeight;
      },
      completer: function(linePartial, callback) {
        cmdparser.completer(linePartial, callback);
      }
    });
    rl.setPrompt('redis> ');
    rl.prompt();
    rl.on('line', function(line) {
      if (output.innerHTML.length > 0) {
        output.innerHTML += '<br>';
      }
      output.innerHTML += '<span class="commandLineCommand">' + escapeHtml(line) + '</span>';

      line = line.trim();

      if (line.toLowerCase() === 'refresh') {
        rl.prompt();
        refreshTree();
        rl.write('OK');
      }
      else {
        $.post('apiv2/exec/' + encodeURIComponent($('#selectedConnection').val()), {cmd: line}, function(execData, status) {
          rl.prompt();

          if (status !== 'success') {
            return alert('Could not delete branch');
          }

          try {
            if (typeof execData === 'string') execData = JSON.parse(execData);
          }
          catch(ex) {
            rl.write(execData);
            return;
          }
          if (execData.hasOwnProperty('data')) execData = execData.data;
          if (Array.isArray(execData)) {
            for (var i = 0; i < execData.length; i++) {
              rl.write((i + 1) + ') ' + JSON.stringify(execData[i]));
            }
          }
          else {
            rl.write(JSON.stringify(execData, null, '  '));
          }
        });
        refreshTree();
      }
    });
  },

  setupCLIKeyEvents: function setupCLIKeyEvents() {
    var ctrl_down = false;
    var isMac = navigator.appVersion.indexOf('Mac') !== -1;
    var cli = $('#_readline_cliForm input');
    cli.on('keydown', function (e) {
      var key = e.which;
      //ctrl
      if (key === 17 && isMac) {
        ctrl_down = true;
      }

      //c
      if (key === 67 && ctrl_down) {
        redisCli.clearCLI();
        e.preventDefault();
      }

      //esc
      if (key === 27) {
        redisCli.clearCLI();
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
  },

  clearCLI: function clearCLI () {
    var cli = $('#_readline_cliForm input');
    if (cli.val() == '') {
      redisCli.hideCommandLineOutput();
    } else {
      cli.val('');
    }
  },

  setupCommandLock: function setupCommandLock() {
    $('#lockCommandButton').on('click', function () {
      $(this).toggleClass('disabled');
    });
  }
};

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
    input.trigger('keyup');
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

var dataUIFuncs = {
  /** function to toggle between display of raw strings and json object view.
   *
   *  This function shows all raw text elements (class 'text-renderer') and
   *  hides json elements (class json-renderer), updating toggle buttons accordingly
   *
   *  @param {string} parentSelector jquery selector with some parent element of the elements with raw text and json
   *  objects to show/hide
   */
  onModeStringButtonClick: function onModeStringButtonClick(parentSelector) {
    var parent = $(parentSelector || '#itemData');
    parent.find('.text-renderer').css('display', 'inline-block');
    parent.find('.json-renderer').css('display', 'none');

    $('#viewModeJsonButton').css('display', 'inline');
    $('#viewModeStringButton').css('display', 'none');
  },

  /** function to toggle between display of raw strings and json object view.
   *
   *  This function shows all json elements (class 'json-renderer') and
   *  hides text elements (class text-renderer), updating toggle buttons accordingly
   *
   *  @param {string} [parentSelector] jquery selector with some parent element of the elements with raw text and json
   *  objects to show/hide, its using '#itemdata' as default if not set
   */
  onModeJsonButtonClick: function onModeJsonButtonClick(parentSelector) {
    var parent = $(parentSelector || '#itemData');
    parent.find('.text-renderer').css('display', 'none');
    parent.find('.json-renderer').css('display', 'inline-block');

    $('#viewModeJsonButton').css('display', 'none');
    $('#viewModeStringButton').css('display', 'inline');
  },

  /** this function generates the json object tree view for all elements containing
   *  the given selector. The raw text to convert to json is taken from the previous element in
   *  the dom tree - e.g. on table column where row X-1 is the text to convert to json and row X
   *  is the selected element to add json object too
   *
   *  @param {string} jsonSelector jquery selector to find all elements where json views should be added
   */
  createJSONViews: function createJSONViews(jsonSelector){
    $(jsonSelector).each(function() {
      var current = $(this);
      var plain = current.prev().html();
      try {
        // display either as string if no valid json or as json object otherwise, ignore exception
        current.jsonViewer(losslessJSON.parse(plain, losslessJsonReviver), {withQuotes: true, withLinks: false});
      }
      catch(ex) {
        // add json-viewer class manually to get same color/fonts
        // calling jsonViewer() method instead gives quoted string like "blah\" blub" if it contains special chars
        current.empty().append($('<span class="json-string">').text('"' + plain + '"'));
      }
    });
  }
};

function escapeHtml (str) {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/\s/g, '&nbsp;');
}

/** helper function to parse json witch may contain big numbers - all numbers that can not be displayed
 *  as a javascript number will be converted to a string. than the correct values can be display as formatted
 *  json at least (needed for jquery.json-viewer)
 */
function losslessJsonReviver(key, value) {
  if (value && value.isLosslessNumber) {
    try {
      return value.valueOf();   // smaller numbers can be converted to a js Number without loosing information
    }
    catch(e) {
      // precision will be lost - does not fit into Number, therefore return BigInt
      // json-viewer library needs support for bigint too
      return BigInt(value.toString());
    }
  }
  else {
    return value;
  }
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

var uiConfig = {
  jsonViewAsDefault: 0,
  const: {
    jsonViewString: 1 << 0,
    jsonViewList: 1 << 1,
    jsonViewHash: 1 << 2,
    jsonViewSet: 1 << 3,
    jsonViewZSet: 1 << 4,
    jsonViewStream: 1 << 5,
    jsonViewReJson: 1 << 6
  }
};


function initCmdParser() {
  let parserOpts = {
    key: function (partial, callback) {
      var redisConnection = $('#selectedConnection').val();
      $.get('apiv2/keys/' + encodeURIComponent(redisConnection) + '/' + partial + '*?limit=20', function (keyData, status) {
        if (status !== 'success') {
          return callback(new Error('Could not get keys'));
        }
        var retData;
        if (typeof keyData === 'string') retData = JSON.parse(keyData);
        else {
          if (keyData.hasOwnProperty('data')) keyData = keyData.data;

          if (Array.isArray(keyData)) {
            retData = keyData.filter(function(item) {
              return item.toLowerCase().indexOf(partial.toLowerCase()) === 0;
            });
          }
          else {
            retData = keyData;
          }
        }
        return callback(null, retData);
      });
    }
  };

  $.get('apiv2/redisCommands')
  .done(function(cmds) {
    cmdparser = new CmdParser(cmds.data, parserOpts);
  })
  .fail(function(error) {
    console.log('failed to load list of supported redis commands, cannot init CmdParser: ' + JSON.stringify(error));
    cmdparser = new CmdParser([], parserOpts);
  });
}

function removeServer (connectionId) {
  var node;
  if (typeof(connectionId) === 'object') {
      // context menu click
      node = getKeyTree().get_node(connectionId.reference[0]);
      connectionId = getRootConnection(node);
  }
  else {
    node = getKeyTree().get_node(connectionId);
  }
  var result = confirm('Are you sure you want to disconnect from "' + node.text + '"?');
  if (result) {
    $.post('logout/' + encodeURIComponent(connectionId), function (err, status) {
      if (status !== 'success') {
        return alert('Could not remove instance');
      }
      $(window).off('beforeunload', 'clearStorage');
      location.reload();
    });
  }
}

function addServer () {
  $('#addServerForm').trigger('submit');
}

/** clear sensitive data (passwords) from add new server form modal and list db modal
 */
function clearAddServerForm() {
  var serverForm = $('#addServerForm');
  serverForm.find('#password').val('');
  serverForm.find('#sentinelPassword').val('');
  $('#selectServerDbList').attr('data-connstring', null).empty();
}

/** extract json data from ad server form and show new modal to allow selection all dbs
 *  found at this redis server.
 *  Only fields for server type, host, port, path and passwords are used. Label and database are ignored.
 */
function detectServerDB() {
  var serverForm = $('#addServerForm');
  $.ajax({
    type: 'POST',
    url: 'login/detectDB',
    data: serverForm.serialize()
  }).done(function(data) {
    var selectDbModal = $('#selectServerDbModal');
    if (!data.ok) {
      alert('Cannot query databases used: \n' + data.message);
    }
    else {
      serverForm.closest('.modal').modal('hide');
      var renderData = {
        title: 'Databases found at Redis ' + data.server + ':',
        infoMessage: (data.dbs.used.length === 0 ? 'No databases found' : ''),
        dbs: data.dbs.used,
        connString: serverForm.serialize()
      };
      renderEjs('templates/detectRedisDb.ejs', renderData, $('#selectServerDbContainer'), function() {
        console.log('rendered all databases found inside redis db template');
        selectDbModal.modal('show');
      });
    }
  }).fail(function (jqXHR) {
    alert('Error fetching list of used databases from this host.');
    clearAddServerForm();
    serverForm.parent('.modal').modal('hide');
  });
}

/** check list of selectServerDbModal and add all selected databases with their display name
 *  do ajax post call for every selected to "/login" and reload at the end to refresh entire UI
 */
 function selectNewServerDbs() {
  var addServerForm = $('#addServerForm');
  var list = $('#selectServerDbModal').find('#selectServerDbList');
  var connectionString = list.data('connstring');
  var selected = list.find('input:checked');

  Promise.all(selected.map(function(item) {
    new Promise(function(resolve, reject) {
      var params = deparam(connectionString);
      params.dbIndex = selected[item].value;
      params.label = $(selected[item]).closest('tr').find('input[type=text]').val();
      $.ajax({
        type: 'POST',
        url: addServerForm[0].action,
        data: $.param(params)
      }).done(function (data) {
        resolve(selected[item].value);
      }).fail(function (err) {
        reject(selected[item].value);
      });
    });
  })).then(function(values) {
    console.log('All database connections requested. Reload now to display then...');
    clearAddServerForm();
    setTimeout(function() {
      $(window).off('beforeunload', 'clearStorage');
      location.reload();
    }, 200);
  });
}

function loadDefaultServer (host, port) {
  console.log('host ' + host);
  console.log('port ' + port);
  $('#hostname').val(host);
  $('#port').val(port);
  $('#addServerForm').trigger('submit');
}

function loadConfig (callback) {
  $.get('config', function (data) {
    if (data) {
      if (data['sidebarWidth']) {
        $('#sideBar').width(data['sidebarWidth']);
      }
      if (data['cliHeight']) {
        $('#commandLineOutput').height(data['cliHeight']);
      }
      if (data['cliOpen'] == true) {
        $('#commandLineOutput').slideDown(0, function () {});
        redisCli.cliOpen = true;
      }
      if (data['locked'] == true) {
        $('#lockCommandButton').removeClass('disabled');
      } else {
        $('#lockCommandButton').addClass('disabled');
      }
      if (data['jsonViewAsDefault']) {
        data['jsonViewAsDefault'].split(',').forEach(function(item) {
          switch (item.trim()) {
            case 'all':
              uiConfig.jsonViewAsDefault = 255;
              break;
            case 'string':
              uiConfig.jsonViewAsDefault = uiConfig.jsonViewAsDefault | uiConfig.const.jsonViewString;
              break;
            case 'list':
              uiConfig.jsonViewAsDefault = uiConfig.jsonViewAsDefault | uiConfig.const.jsonViewList;
              break;
            case 'hash':
              uiConfig.jsonViewAsDefault = uiConfig.jsonViewAsDefault | uiConfig.const.jsonViewHash;
              break;
            case 'set':
              uiConfig.jsonViewAsDefault = uiConfig.jsonViewAsDefault | uiConfig.const.jsonViewSet;
              break;
            case 'zset':
              uiConfig.jsonViewAsDefault = uiConfig.jsonViewAsDefault | uiConfig.const.jsonViewZSet;
              break;
            case 'stream':
              uiConfig.jsonViewAsDefault = uiConfig.jsonViewAsDefault | uiConfig.const.jsonViewStream;
              break;
            case 'rejson':
              uiConfig.jsonViewAsDefault = uiConfig.jsonViewAsDefault | uiConfig.const.jsonViewReJson;
              break;
          }
        });
      }
      resizeApp();
      if (callback) {
        callback();
      }
    }
  });
}

function resizeApp () {
  var body = $('#body');
  var keyTree = $('#keyTree');
  var sideBar =  $('#sideBar');
  var barWidth = keyTree.outerWidth(true);
  var newBodyWidth = $(window).width() - barWidth - parseInt(body.css('margin-left'), 10);
  sideBar.css('width', barWidth + "px");
  keyTree.height($(window).height() - keyTree.offset().top - $('#commandLineContainer').outerHeight(true));
  body.css({'width': newBodyWidth + "px", 'left': barWidth + "px", 'height': sideBar.css('height')});
  $('#itemData').css('margin-top', $('#itemActionsBar').outerHeight(false));
  var cli = $('#_readline_cliForm');
  cli.find('#_readline_input').width( cli.innerWidth() - cli.find('.prompt').outerWidth() -20 )
}

function setupResizeEvents () {
  var sidebarResizing = false;
  var sidebarFrame = $('#sideBar').width();
  var commandResizing = false;
  var commandFrame = $('#commandLineOutput').height();

  $('#keyTree').on('resize', resizeApp);
  $(window).on('resize', resizeApp);

  $(document).on('mouseup', function (event) {
    sidebarResizing = false;
    sidebarFrame = $('#sideBar').width();
    commandResizing = false;
    commandFrame = $('#commandLineOutput').height();
    $('body').removeClass('select-disabled');
  });

  $('#sidebarResize').on('mousedown', function (event) {
    sidebarResizing = event.pageX;
    $('body').addClass('select-disabled');
  });

  $('#commandLineBorder').on('mousedown', function (event) {
    commandResizing = event.pageY;
    $('body').addClass('select-disabled');
  });

  $(document).on('mousemove', function (event) {
    if (sidebarResizing) {
      $('#sideBar').width(sidebarFrame - (sidebarResizing - event.pageX));
    } else if (commandResizing &&
      $('#commandLineOutput').is(':visible')) {
      $('#commandLineOutput').height(commandFrame + (commandResizing - event.pageY));
      resizeApp();
    }
  });
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
    $.post(signinPath, {}, function (data, status) {
      if ((status !== 'success') || !data || !data.ok) {
        console.error('Cannot refresh query token');
        return;
      }
      sessionStorage.setItem('redisCommanderBearerToken', data.bearerToken);
      sessionStorage.setItem('redisCommanderQueryToken', data.queryToken);
    })
    .fail(function(err) {
      console.error('Failed to refresh query token', err);
    });
  }

  /**
   * Export redis data.
   */
  $('#app-container').on('submit', '#redisExportForm', function () {
    window.open('tools/export?' + $(this).serialize() + '&redisCommanderQueryToken=' + encodeURIComponent(sessionStorage.getItem('redisCommanderQueryToken')), '_blank');
    refreshQueryToken();
    return false;
  });

  /**
   * Show export form.
   */
  $('#redisExportData').on('click', function () {
    $.ajax({
      method: 'GET',
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
      $('#body').html('<h2>Import</h2>Importing in progress. Please wait...');

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
        method: 'GET',
        url: 'tools/forms/import',
        success: function (res) {
          $('#body').html(res);
        }
      });
    });
  }

  /**
   * Refresh all nodes in tree, do not change open/close state
   */
  $('#refreshNodes').on('click', function () {
    refreshTree();
  });

  /**
   * Refresh and expand all nodes in tree, need to wait a bit after refresh, otherwise open is ignored
   */
  $('#expandAllNodes').on('click', function () {
    getKeyTree().refresh(false, true);
    setTimeout(function() {
      getKeyTree().open_all(getKeyTree().get_node('#'));
    }, 300);
  });
});


function deparam(query) {
  var pairs, i, keyValuePair, key, value, map = {};
  // remove leading question mark if its there
  if (query.slice(0, 1) === '?') {
    query = query.slice(1);
  }
  if (query !== '') {
    pairs = query.split('&');
    for (i = 0; i < pairs.length; i += 1) {
      keyValuePair = pairs[i].split('=');
      key = decodeURIComponent(keyValuePair[0]);
      value = (keyValuePair.length > 1) ? decodeURIComponent(keyValuePair[1]) : undefined;
      map[key] = value;
    }
  }
  return map;
}

/// IE11 polyfills
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function(search, this_len) {
    if (this_len === undefined || this_len > this.length) {
      this_len = this.length;
    }
    return this.substring(this_len - search.length, this_len) === search;
  };
}

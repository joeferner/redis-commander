# HowTo to add support for new Redis data types

This document gives a short overview about steps needed to display/add/edit new
redis data types introduced via redis server extension modules and so on.

Adding support for new types is most easy if redis command `type` returns
a unique string and not on of the already supported datatypes (e.g. "stream").
For non unique types or types not directly know to redis (e.g. binary data has type "string").
there must be some kind of differentiation done server-side to toggle between
booth types.

This guide assumes Redis returns a new unique type.

### Display data (read-only support)

1. Add new EJS template inside `web/static/templates` folder to display data
2. Design new treeview icon inside folder `web/static/images`
3. modify file `web/static/scripts/redisCommander.js` the methods `getIconForType()`
   and point to your own icon for the given new type.
4. modify file `web/static/scripts/redisCommander.js` the methods `loadKey()`, add another case to the `switch(keyData.type).
   The method called here should render the new template with given data.
5. modify `lib/routes/apiv1.js` method `getKeyDetails()` and add handling of new
   datatype to switch expression. The new getDetails method must fetch all data displayed
   at the EJS template together with the TTL field.
   For unsupported commands in "ioredis" library the `redisConnection.call('COMMAND', arguments)`
   syntax should be used.
6. Update README and CHANGELOG to mention new support.

### Add new data for this type

The following steps add support to add new data for this type to Redis Commander.
It does not allow modification of existing data.

1. Update EJS template `web/views/modals/addKeyModal.ejs`, add new type to the "keyType" dropdown.
   If necessary add new Fields to the form that are hidden as default and only made visible
   whenever user selects this new type. The javascript code to handle form modifications on
   type selection can be found in `web/static/scripts/redisCommander.js` at method `setupAddKeyButton()`.
2. Add server-side code to add new key data. On submit of the form inside the browser it calls
   the browser method `addNewKey()` which in turn post the data to the server, triggering the
   method `saveKey()` from `lib/routes/apiv1.js`. Add new data type to the `switch (type)` part here.
3. Add new "post", "put" routes to "apiv1.js" file for more explicit datatype support.
3. Update README and CHANGELOG to mention new support.

### Delete data for this type

Deleting data via right-click on tree or pressing "DEL" key is supported
out-of-the box via

1. Add delete button to the client-side EJS template that displays the data.
   located under `web/static/templates`. This button should trigger the `deleteKey()`.
2. Make sure the client template only renders the button if not in read-only mode
   (template variable `redisReadOnly` is not true)
3. To allow deletion via "delete" route add them to the "apiv1.js" file.
   This can be done together with the Modify data implementation.
4. Update README and CHANGELOG to mention new support.

### Modify existing data

1. Decide if data for this type can be edited directly (like string) or should be displayed only and
   another modal dialog is needed to modify them., Update view template under
   `web/static/templates` accordingly.
2. Make sure to allow modification of data only if not in read-only mode
   (template variable `redisReadOnly` is not true) - e.g. no "Save" button or loading edit modal
   when for read-only instances.
3. (optional) Add new modal to edit data, add EJS template at `web/views/modals`.
   Some more complex datatypes with "sub-data" (e.g. lists, sets, ...) use another modal ta add
   this new sub-data, e.g. add new data to a list and so on. These modals trigger
   their respective client-side javascript methods to check validity or post them
   to the correct server api.
4. Add extra methods to populate modals with data (similiar to `addXSetMember()` `editXSetMember()` and
   `removeXSetMember()` in `web/static/scripts/redisCommander.js`).
5. (optional) add delete button to the modify entry modal. This button can either trigger an
   explicit delete method server-side or (as most other do) set value to `tombstone` and send
   form to the update/modify method non server (similiar to `removeXSetMember()` in
   `web/static/scripts/redisCommander.js`)
6. Include all new modals at the end of the file `web/views/layout.ejs` beneath the other modals.
7. Add new "post" routes to "apiv1.js" file for more explicit datatype support.
8. Update README and CHANGELOG to mention new support.

// JSONTree 0.1.7
function JSONTree() {
	
}

JSONTree.id=0;
JSONTree.random = 0;

JSONTree.escapeMap = {	'&': '&amp;',
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;',
					"'": '&#x27;',
					'/': '&#x2F;' };

JSONTree.escape=function(text) {
    return text.replace(/[&<>'"]/g, function(t) {
        return JSONTree.escapeMap[t];
    });
}

JSONTree.create=function(data) {
	JSONTree.id = 0;
	JSONTree.random = Math.random();
	return JSONTree.div(JSONTree.jsValue(data), {'class': 'json-content'});
}

JSONTree.newId=function() {
	JSONTree.id += 1;
	return JSONTree.random + "_" + JSONTree.id;
}

JSONTree.div=function(text, attrs) {
	return JSONTree.html('div', text, attrs);
}

JSONTree.span=function(text, attrs) {
	return JSONTree.html('span', text, attrs);
}

JSONTree.html=function(type, text, attrs) {
		var html = '<' + type;
		if (attrs != null) {
			Object.keys(attrs).forEach(function(attr) {
				html += ' ' + attr + '=\"' + attrs[attr] + '\"';
			});
		}
		html += '>' + text + '</' + type + '>';
		return html;
	}
/* icon for collapsing/expanding a json object/array */
JSONTree.collapseIcon=function(id) {
	var attrs = {'onclick': "JSONTree.toggleVisible('collapse_json" + id + "')" };
	return JSONTree.span(JSONTree.collapse_icon, attrs);
}

/* a json value might be a string, number, boolean, object or an array of other values */
JSONTree.jsValue=function(value) {
	if (value == null) {
		return JSONTree.jsText("null","null");
	}
	var type = typeof value;
	if (type === 'boolean' || type === 'number') {
		return JSONTree.jsText(type,value);
	} else if (type === 'string') {
		return JSONTree.jsText(type,'"' + JSONTree.escape(value) + '"');
	} else {
		var elementId = JSONTree.newId();
		return value instanceof Array ? JSONTree.jsArray(elementId, value) : JSONTree.jsObject(elementId, value);
	}
}

/* json object is made of property names and jsonValues */
JSONTree.jsObject=function(id, data) {
	var object_content = "{" + JSONTree.collapseIcon(id);;
	var object_properties = '';
	Object.keys(data).forEach(function(name, position, names) {
		if (position == names.length - 1) { // dont add the comma
			object_properties += JSONTree.div(JSONTree.jsProperty(name, data[name]));
		} else {
			object_properties += JSONTree.div(JSONTree.jsProperty(name, data[name]) + ',');
		}			
	});
	object_content += JSONTree.div(object_properties, {'class': 'json-visible json-object', 'id': "collapse_json" + id});
	return object_content += "}";
}

/* a json property, name + value pair */
JSONTree.jsProperty=function(name, value) {
	return JSONTree.span('"' + JSONTree.escape(name) + '"', {'class': 'json-property'}) + " : " + JSONTree.jsValue(value);
}

/* array of jsonValues */
JSONTree.jsArray=function(id, data) {
	var array_content = "[" + JSONTree.collapseIcon(id);;
	var values = '';
	for (var i = 0; i < data.length; i++) {
		if (i == data.length - 1) {
			values += JSONTree.div(JSONTree.jsValue(data[i]));
		} else {
			values += JSONTree.div(JSONTree.jsValue(data[i]) + ',');
		}
	}
	array_content += JSONTree.div(values, {'class':'json-visible json-object', 'id': 'collapse_json' + id});
	return array_content += "]";
}

/* simple value(string, boolean, number...) */
JSONTree.jsText=function(type, value) {
	return JSONTree.span(value, {'class': "json-" + type});
}

JSONTree.toggleVisible=function(id) {
	var element = document.getElementById(id);
	var element_class = element.className;
	var classes = element_class.split(" ");
	var visible = false;
	for (var i = 0; i < classes.length; i++) {
		if (classes[i] === "json-visible") {
			visible = true;
			break;
		}
	}
	element.className = visible ? "json-collapsed json-object" : "json-object json-visible";
	element.previousSibling.innerHTML = visible ? JSONTree.expand_icon : JSONTree.collapse_icon;
}

JSONTree.configure=function(collapse_icon,expand_icon) {
	JSONTree.collapse_icon = collapse_icon;
	JSONTree.expand_icon = expand_icon;
}

JSONTree.collapse_icon=JSONTree.span('',{'class' : 'json-object-collapse'});

JSONTree.expand_icon=JSONTree.span('',{'class' : 'json-object-expand'});
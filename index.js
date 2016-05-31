var _ = require('lodash'),
	xml2js = require('xml2js'),
	uuid = require('node-uuid');

var pawConverter = {
	requestGroups: [],
	folderGroups: [],
	headerGroups: [],
	zidRidMap: {},
	collection: {},

	createCollection: function(rootFolder) {
		var name = "New Collection from Paw";
		_.each(rootFolder.attribute, function(attr) {
			if(attr.$.name === "name") {
				name = attr._;
			}
		});
		this.collection = {
			id: uuid.v4(),
			name: name,
			description: "New collection (converted from paw)",
			order: [],
			folders: [],
			requests: [],
			timestamp: (new Date()).getTime()
		};
	},

	/**
	* Adds a LMREQUEST object to this.collection.requests ONLY (not order)
	*/
	addRequestToCollection: function(pawRequest) {
		var request = {
			id: uuid.v4(),
			name: "New request",
			url: "",
		};

		request.collectionId = this.collection.id;

		_.each(pawRequest.attribute, function(attr) {
			if(attr.$.name === "url") {
				request.url = attr._;
			}
			else if(attr.$.name === "method") {
				request.method = attr._;
			}
			else if(attr.$.name === "name") {
				request.name = attr._;
			}
		});

		this.collection.requests.push(request);
		this.zidRidMap[pawRequest.$.id] = request.id;
	},

	addRequestsToCollection: function(rootFolder) {
		var idrefs = "",
			foundRequests = [],
			oldThis = this;

		//1. First, add ALL LMREQUEST objects to collection.requests
		_.each(this.requestGroups, this.addRequestToCollection.bind(this));

		//2. Get all the collection's children
		_.each(rootFolder.relationship, function(rel) {
			if(rel.$.name === "children") {
				idrefs = rel.$.idrefs;
			}
		});

		idrefs = idrefs.split(" ");


		//3. Add relevant UUID to collection.order
		_.each(idrefs, function(pawObjectId) {
			_.each(oldThis.requestGroups, function(requestGroup) {
				if(requestGroup.$.id == pawObjectId) {
					oldThis.collection.order.push(oldThis.zidRidMap[pawObjectId]);
				}
			});
		});
	},

	prependRequestWithFolder: function(rid, folder) {
		var oldThis = this,
			i = 0;

		for(i=0;i<this.collection.requests.length;i++) {
			if(this.collection.requests[i].id == rid) {
				this.collection.requests[i].name = folder + " > " + this.collection.requests[i].name;
			}
		}
	},

	setFolderIdInRequest: function(rid, fid) {
		var oldThis = this,
			i = 0;
		for(i = 0; i < this.collection.requests.length; i++) {
			if(this.collection.requests[i].id == rid) {
				this.collection.requests.folder = fid;
			}
		}
	},

	handleSubFolder: function(parentFolderId, prefix, folderGroup) {
		//all requests directly under folderGroup have to be added to parentFolderName
		//all subfolders inside this folder have to be handled the same way
		var retVal = [],
			oldThis = this;
		
		_.each(folderGroup.relationship, function(rel) {
			if(rel.$.name === "children") {
				idrefs = rel.$.idrefs;
			}
		});
		idrefs = idrefs.split(" ");

		var thisFolderName = "";
		_.each(folderGroup.attribute, function(attr) {
			if(attr.$.name === "name") {
				thisFolderName = attr._;
			}
		});

		_.each(idrefs, function(pawObjectId) {
			//if we find a request, add to folder.order
			_.each(oldThis.requestGroups, function(requestGroup) {
				if(requestGroup.$.id == pawObjectId) {
					var rid = oldThis.zidRidMap[requestGroup.$.id];
					retVal.push(rid);
					oldThis.prependRequestWithFolder(rid, thisFolderName);
				}
			});

			//if we find a folder, get the DFS of all the requests
			_.each(oldThis.folderGroups, function(folderGroup) {
				if(folderGroup.$.id == pawObjectId) {
					var subFoldersOrder = oldThis.handleSubFolder(parentFolderId, 
						prefix + " > " + folder.name, 
						folderGroup);
					retVal = retVal.concat(subFoldersOrder);
				}
			});

		});
	
		return retVal;
	},

	addFolderToCollection: function(folderGroup) {
		var folder = {
				id: uuid.v4(),
				order: []
			},
			idrefs = "",
			oldThis = this;

		_.each(folderGroup.attribute, function(attr) {
			if(attr.$.name === "name") {
				folder.name = attr._;
			}
		});

		//add request to order
		_.each(folderGroup.relationship, function(rel) {
			if(rel.$.name === "children") {
				idrefs = rel.$.idrefs;
			}
		});
		idrefs = idrefs.split(" ");

		_.each(idrefs, function(pawObjectId) {
			//if we find a request, add to folder.order
			_.each(oldThis.requestGroups, function(requestGroup) {
				if(requestGroup.$.id == pawObjectId) {
					var rid = oldThis.zidRidMap[pawObjectId];
					oldThis.setFolderIdInRequest(rid, folder.id);
					folder.order.push(rid);
				}
			});

			//if we find a folder, get the DFS of all the requests
			_.each(oldThis.folderGroups, function(folderGroup) {
				if(folderGroup.$.id == pawObjectId) {
					var subFoldersOrder = oldThis.handleSubFolder(folder.id, "", folderGroup);
					folder.order = folder.order.concat(subFoldersOrder);
				}
			});

		});
		oldThis.collection.folders.push(folder);
	},

	addFoldersToCollection: function(rootFolder) {
		var idrefs = "",
			foundRequests = [],
			oldThis = this;


		//2. Get all the collection's children
		_.each(rootFolder.relationship, function(rel) {
			if(rel.$.name === "children") {
				idrefs = rel.$.idrefs;
			}
		});

		idrefs = idrefs.split(" ");


		//3. For collections that are requests, add relevant UUID to collection.order
		_.each(idrefs, function(pawObjectId) {
			_.each(oldThis.folderGroups, function(folderGroup) {
				if(folderGroup.$.id == pawObjectId) {
					oldThis.addFolderToCollection(folderGroup);
				}
			});
		});
	},

	convertPawObject: function(obj) {
		obj = obj.database.object;
		var oldThis = this;
		//obj is an array of <objects>

		//1. Classify each object into a folder, request, header
		_.each(obj, function(objElement) {
			if(objElement.$.type === "LMREQUESTGROUP") {
				oldThis.folderGroups.push(objElement);
			}
			else if(objElement.$.type === "LMREQUEST") {
				oldThis.requestGroups.push(objElement);
			}
		});

		//2. Find foldergroup with no parent
		var rootFolder = _.find(this.folderGroups, function(folderGroup) {
			return _.find(folderGroup.relationship, function(rel) {
				return (rel.$.name === "parent" && !rel.$.idrefs);
			});
		});
		
		this.createCollection(rootFolder);

		this.addRequestsToCollection(rootFolder);

		this.addFoldersToCollection(rootFolder);

		return this.collection;
	},

	convert: function(pawXmlString, callback) {
		var options = {},
			oldThis = this;
		xml2js.parseString(pawXmlString, options, function(err, result) {
			var collection = oldThis.convertPawObject(result);
			callback(err, collection);
		});
	},
};

module.exports = pawConverter;
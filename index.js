var fs = require('fs-extra');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var redis = require("redis");
var redisClient = redis.createClient();
var multer  = require('multer');
var upload = multer({ dest: 'uploads/' });
var exphbs = require('express-handlebars');

app.engine('.hbs', exphbs({defaultLayout: 'single', extname: '.hbs'}));
app.set('view engine', '.hbs');

app.use('/session_files', express.static('session_files'));
app.use('/static', express.static('static'));

var addUnMuteDeleteCounter = 0;
var settingsCounter = {};

redisClient.on("error", function (err) {
    console.log("Error " + err);
});

io.on('connection', function (socket) {
	socket.on('registerWithId', handleSocketRegistration);
	socket.on('updateRequest', handleUpdateRequest);
	socket.on('settingsRequest', handleSettingsRequest);
	socket.on('registerResultsVideo', readResultRects);
});

app.get('/session/:id', function (req, res) {
	var id = searchForId(req.params.id);
	if(id == null) {
		res.sendStatus(404);
	}
	else {
		res.render('session_main', {
			sessionId: id
		});
	}
});

// app.get('/loadDefaultLogos/:id', function(req, res) {
	// var id = searchForId(req.params.id);
	// if(id == null) {
		// res.sendStatus(404);
	// }
	// else {		
		// fs.readdir(__dirname + "/default_logos/", function(err, files) {
			// var data = {};
			// var redisMultiCommand = redisClient.multi();
			// if(files) {
				// for(var i = 0; i < files.length; i++) {
					// var newName = uniqueNameGenerator(__dirname + "/session_files/" + id + "/logo_images/", files[i]);
					
					// fs.copySync(
						// __dirname + "/default_logos/" + files[i],
						// __dirname + "/session_files/" + id + "/logo_images/" + newName
					// );
					
					// data[newName] = {
						// url: "/session_files/" + id + "/logo_images/" + newName,
						// status: "Loading"
					// }
					
					// var json = {
						// command: "add",
						// name: newName,
					// }
					
					// redisMultiCommand.rpush("nodeToStorm", JSON.stringify(json));	
				// }
			// }
			// res.json(data);
			// redisMultiCommand.exec();
		// });
	// }
// });

app.post('/upload/:id', upload.array('logos'), function(req, res) {
	var id = searchForId(req.params.id);
	if(id == null) {
		res.sendStatus(404);
	}
	else {
		var data = {};
		var redisMultiCommand = redisClient.multi();
		for(var i = 0; i < req.files.length; i++) {
			var newName = uniqueNameGenerator(__dirname + "/session_files/" + id + "/logo_images/", req.files[i].originalname);
			
			fs.renameSync(
				__dirname + "/" + req.files[i].path,
				__dirname + "/session_files/" + id + "/logo_images/" + newName
			);
			
			data[newName] = {
				url: "/session_files/" + id + "/logo_images/" + newName,
				status: "Loading"
			}
			
			var json = {
				command: "add",
				name: newName,
				id: ++addUnMuteDeleteCounter
			}
			
			redisMultiCommand.rpush("nodeToStorm", JSON.stringify(json));
			
			var fileData = fs.readFileSync(__dirname + "/session_files/" + id + "/logo_images/" + newName);
			redisMultiCommand.hset("logoData", newName, fileData);
		}
		res.sendStatus(204);
		io.emit("add_" + id, data);
		redisMultiCommand.exec();
	}
});	

var server = http.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Listening at http://%s:%s', host, port);
});

// ===== Routes for Storm =====

// app.post('/confirmAdd/:id/:logoId', function (req, res) {
	// var id = searchForId(req.params.id);
	// if(id == null) {
		// res.sendStatus(404);
	// }
	// else {
		// var logoName = req.params.logoId;
		// var obj = {};
		// obj[logoName] = {status: "Done"}
		// io.emit("update_" + id, obj);
		// res.sendStatus(204);
	// }
// });


//setTimeout(readFromAddConfirmList, 3000, id);
// function readFromAddConfirmList(id) {
	// redisClient.lpop("addList", function(err, value) { //addConfirmList
		// if(value != null) {
			// var obj = {};
			// obj[value] = {status: "Done"}
			// io.emit("update_" + id, obj);
			// readFromAddConfirmList(id);
		// }
	// });
// }

function initFromLogoStateStore(id) {
	redisClient.hgetall("logoStateStore", function(err, value) {		
		var data = {};
		for(var i in value) {
			data[i] = {
				url: "/session_files/" + id + "/logo_images/" + i,
				status: value[i]
			}
		}
		io.emit("add_" + id, data);
		
		//TODO timing issue... emit maybe slow (due to server or client or network, async nature of emit)
		
		readStormReply(id);
	});
}

function readStormReply(id) {
	redisClient.lpop("stormToNode", function(err, value) {
		if(value != null) {
			var json = JSON.parse(value);
			
			if(json.command.startsWith("set")) {
				// Update logo state (logoStateStore)
				io.emit("settingsReply_" + id, json);
			}
			else {
				var status = "";
				var obj = {};
				
				// TODO The logo state should be conditionally updated.
				if(json.command == "add") {
					status = "Loaded";
					redisClient.hset("logoStateStore", json.name, status);
					obj[json.name] = {status: status};
				}
				else if(json.command == "unmute") {
					status = "Loaded";
					redisClient.hset("logoStateStore", json.name, status);
					obj[json.name] = {status: status};
				}
				else if(json.command == "mute") {
					status = "Muted";
					redisClient.hset("logoStateStore", json.name, status);
					obj[json.name] = {status: status};
				}
				else if(json.command == "delete") {
					status = "Deleted";
					redisClient.hdel("logoStateStore", json.name);
					obj[json.name] = {status: status};
				}
				
				// Send the updated status to browser
				io.emit("updateReply_" + id, obj);
			}
			
			// Repeat reading from queue
			setTimeout(readStormReply, 0, id);
		}
		else {
			setTimeout(readStormReply, 1000, id);
		}
	});
}

var resultRectsCounter = 0.0;
var framePeriod = 2; // = 1 / fps
function readResultRects() {
	redisClient.lpop("resultRects", function(err, value) {
		if(value != null) {
			var json = JSON.parse(value);
			
			for(var i = 0; i < json.length; i++) {
				json[i].startTime = resultRectsCounter;
				json[i].endTime = resultRectsCounter + framePeriod;
				json[i].url = "http://www.google.com";
			}
			
			io.emit("addResultRects", json);
			
			resultRectsCounter += framePeriod;
			
			// Repeat reading from queue
			setTimeout(readResultRects, 0);
		}
		else {
			setTimeout(readResultRects, 1000);
		}
	});
}

function handleSocketRegistration(data) {
	console.log("Receieved socket ID registration: " + data.id);
	initFromLogoStateStore(data.id);
}

function handleUpdateRequest(data) {
	data.id = ++addUnMuteDeleteCounter;
	redisClient.rpush("nodeToStorm", JSON.stringify(data));
}

function handleSettingsRequest(data) {
	settingsCounter[data.name] = settingsCounter[data.name] || 0;
	data.id = ++settingsCounter[data.name];
	redisClient.rpush("nodeToStorm", JSON.stringify(data));
}

function uniqueNameGenerator(path, filename) {
	var lastDotPosition = filename.lastIndexOf(".");
	var extension = "";
	if(lastDotPosition != -1) {
		extension = filename.substring(lastDotPosition);
		filename = filename.substring(0, lastDotPosition);
	}
	try {
		while(true) {
			fs.accessSync(path + filename + extension, fs.F_OK);
			filename += String(Math.floor((Math.random() * 10)));
		}
	} catch(e) {
		return filename + extension;
	}
}

function searchForId(rawId) {
	var id = parseInt(rawId);
	
	if(!isNaN(id) && rawId == String(id) && id >= 1 && id <= 10)
		return id;
	return null;
}
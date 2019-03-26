"use strict";

/* jshint node: true */

/*
 * This builds on the webServer of previous projects in that it exports the current
 * directory via webserver listing on a hard code (see portno below) port. It also
 * establishes a connection to the MongoDB named 'cs142project6'.
 *
 * To start the webserver run the command:
 *    node webServer.js
 *
 * Note that anyone able to connect to localhost:portNo will be able to fetch any file accessible
 * to the current user in the current directory or any of its children.
 *
 * This webServer exports the following URLs:
 * /              -  Returns a text status message.  Good for testing web server running.
 * /test          - (Same as /test/info)
 * /test/info     -  Returns the SchemaInfo object from the database (JSON format).  Good
 *                   for testing database connectivity.
 * /test/counts   -  Returns the population counts of the cs142 collections in the database.
 *                   Format is a JSON object with properties being the collection name and
 *                   the values being the counts.
 *
 * The following URLs need to be changed to fetch there reply values from the database.
 * /user/list     -  Returns an array containing all the User objects from the database.
 *                   (JSON format)
 * /user/:id      -  Returns the User object with the _id of id. (JSON format).
 * /photosOfUser/:id' - Returns an array with all the photos of the User (id). Each photo
 *                      should have all the Comments on the Photo (JSON format)
 *
 */
var session = require('express-session');
var bodyParser = require('body-parser');
var multer = require('multer');
var processFormBody = multer({storage: multer.memoryStorage()}).single('uploadedphoto');
var fs = require("fs");

var mongoose = require('mongoose');
var async = require('async');


// Load the Mongoose schema for User, Photo, and SchemaInfo
var User = require('./schema/user.js');
var Photo = require('./schema/photo.js');
var SchemaInfo = require('./schema/schemaInfo.js');

var express = require('express');
var app = express();

// XXX - Your submission should work without this line
//var cs142models = require('./modelData/photoApp.js').cs142models;

mongoose.connect('mongodb://localhost/cs142project6');

// We have the express static module (http://expressjs.com/en/starter/static-files.html) do all
// the work for us.
app.use(express.static(__dirname));

// Add express-session and body-parser middleware to express with the Express use:
app.use(session({secret: 'secretKey', resave: false, saveUninitialized: false}));
app.use(bodyParser.json());


app.get('/', function (request, response) {
    response.send('Simple web server of files from ' + __dirname);
});

/*
 * Use express to handle argument passing in the URL.  This .get will cause express
 * To accept URLs with /test/<something> and return the something in request.params.p1
 * If implement the get as follows:
 * /test or /test/info - Return the SchemaInfo object of the database in JSON format. This
 *                       is good for testing connectivity with  MongoDB.
 * /test/counts - Return an object with the counts of the different collections in JSON format
 */

 app.post('/admin/logout', function(request, response){
     request.session.user_id = null;
     request.session.login_name = null;
     request.session.destroy(function (err){
       //console.error("err is: " + err);
       if (err)
       {
         response.status(400).end('Error destroying the request session');
         console.log("Error destroying the request session!");
         console.log(err);
         return;
       }
       else {
         console.log("Successfully logged out!");
         response.status(200).end();
         return;
       }
     });
 });

app.get('/test/:p1', function (request, response) {
    // Express parses the ":p1" from the URL and returns it in the request.params objects.
    if (request.session.user_id) {
    console.log('/test called with param1 = ', request.params.p1);

    var param = request.params.p1 || 'info';

    if (param === 'info') {
        // Fetch the SchemaInfo. There should only one of them. The query of {} will match it.
        SchemaInfo.find({}, function (err, info) {
            if (err) {
                // Query returned an error.  We pass it back to the browser with an Internal Service
                // Error (500) error code.
                console.error('Doing /user/info error:', err);
                response.status(500).send(JSON.stringify(err));
                return;
            }
            if (info.length === 0) {
                // Query didn't return an error but didn't find the SchemaInfo object - This
                // is also an internal error return.
                response.status(500).send('Missing SchemaInfo');
                return;
            }

            // We got the object - return it in JSON format.
            console.log('SchemaInfo', info[0]);
            response.end(JSON.stringify(info[0]));
        });
    } else if (param === 'counts') {
        // In order to return the counts of all the collections we need to do an async
        // call to each collections. That is tricky to do so we use the async package
        // do the work.  We put the collections into array and use async.each to
        // do each .count() query.
        var collections = [
            {name: 'user', collection: User},
            {name: 'photo', collection: Photo},
            {name: 'schemaInfo', collection: SchemaInfo}
        ];
        async.each(collections, function (col, done_callback) {
            col.collection.count({}, function (err, count) {
                col.count = count;
                done_callback(err);
            });
        }, function (err) {
            if (err) {
                response.status(500).send(JSON.stringify(err));
            } else {
                var obj = {};
                for (var i = 0; i < collections.length; i++) {
                    obj[collections[i].name] = collections[i].count;
                }
                response.end(JSON.stringify(obj));

            }
        });
    } else {
        // If we know understand the parameter we return a (Bad Parameter) (400) status.
        response.status(400).send('Bad param ' + param);
    }
  }
  else {
    console.log("unauthorized request for /test");
    response.status(401).end('unauthorized');
  }
});

app.post('/user', function(request, response){
    if (request.body.login_name && request.body.first_name && request.body.last_name && request.body.password){
      // Check if the login_name has already been taken!
      User.findOne({login_name: request.body.login_name}, 'login_name', function(err, user)
      {
        if (user) {
          response.status(400).end('Registration failed. Desired login_name is already taken.');
          console.log("I found an existing user with the same login_name");
          return;
        }
        User.create({
          login_name: request.body.login_name,
          password: request.body.password,
          first_name: request.body.first_name,
          last_name: request.body.last_name,
          location: request.body.location,
          description: request.body.description,
          occupation: request.body.occupation
        }, function doneCallback(err, newUser){
          if (err) {
            response.status(400).end('Registration failed because back-end failed to register user!');
            console.log("I'm in the doneCallback of User.create!");
          }
          else {
            newUser.save(function (err) {
              if (err) {
                console.log('Failed to save newly registered user!');
                response.status(400).end('Registration failed because back-end failed to save newly registered user!');
              }
              else {
                console.log('Successfully saved newly registered user!');
                response.status(200).end(JSON.stringify(newUser));
              }
            });
          }
        });
      });
    }
    else {
      console.log('Some required field(s) are missing.');
      response.status(400).send('Some required field(s) are missing.');
      return;
    }
  });
/*
 * URL /user/list - Return all the User object.
 */
app.get('/user/list', function (request, response) {
  if (request.session.user_id)
  {
    console.log('/user/list called');
    User.find({}, '_id first_name last_name', function (err, users) {
    /* users is an array of objects */
       if (err) {
         console.error('Doing /user/list error:', err);
         response.status(400).end(JSON.stringify(err));
         return;
       }
       if (users.length === 0){
         response.status(400).end('Missing Users List');
         return;
       }
       console.log("Yay! I found users list");
       response.status(200).end(JSON.stringify(users));
    });
  }

  else {
    console.log("attempted to get user list but failed!");
    response.status(401).end('unauthorized');
  }
});

/*
 * _id: "57231f1a30e4351f4e9f4bdc", first_name: "John", last_name: "Ousterhout",
           location: "Stanford, CA", description: "<i>CS142!</i>", occupation: "Professor"
 * URL /user/:id - Return the information for User (id)
 */
app.get('/user/:id', function (request, response) {
  if (request.session.user_id){
    var id = request.params.id;
    User.findOne({_id: id}, '_id first_name last_name location description occupation', function(err, user)
    {
      if (err) {
          console.error('Doing /user/:id error:', err);
          response.status(400).end(JSON.stringify(err));
          return;
      }
      if (user.length === 0){
        response.status(400).end('Missing the user with id: ' + id);
        return;
      }
      console.log("Yay! I found user with id " + id);
      response.status(200).end(JSON.stringify(user));
    });
  }
  else {
    response.status(401).end('unauthorized');
  }
});


app.get('/photosOfUser/:id', function (request, response) {
  if (request.session.user_id) {
    var id = request.params.id;
    Photo.find({user_id:id}, '_id date_time file_name user_id comments', function(err, photos) {
      if (err) {
          console.error('Doing /photosOfUser/:id error:', err);
          response.status(400).end(JSON.stringify(err));
          return;
      }
      if (photos.length === 0){
        response.status(200).end("Missing photos list for user " + id);
        return;
      }
      var photo_array = [];
      async.each(photos,
                 function (photo, finishedProcessingPhoto)
                 {
                   var comments_for_photo = [];
                   async.each(photo.comments,
                              function (comment, finishedAddingCommentsForPhoto)
                              {
                                  User.findOne({_id: comment.user_id}, '_id first_name last_name',
                                    function(err, user)
                                    {
                                      if (err) {
                                        console.log("Comment has no found user!");
                                        finishedAddingCommentsForPhoto();
                                      }

                                      else if (user.length === 0){
                                        console.log('Missing the user with id: ' + comment.user_id);
                                        finishedAddingCommentsForPhoto();
                                      }

                                      else
                                      {
                                        var user_obj = {_id: user._id, first_name: user.first_name, last_name: user.last_name};
                                        var unpacked_comment = JSON.parse(JSON.stringify(comment));
                                        delete unpacked_comment.user_id;
                                        unpacked_comment.user = user_obj;
                                        //comments_for_photo.push(unpacked_comment);
                                        comments_for_photo = comments_for_photo.concat([unpacked_comment]);
                                        finishedAddingCommentsForPhoto();
                                      }
                                    });
                              },
                              function (err)
                              {
                                if (err)
                                {
                                  console.log("Cannot add comments to photo!");
                                  finishedProcessingPhoto();
                                }
                                else
                                {
                                  var newPhoto = JSON.parse(JSON.stringify(photo));
                                  newPhoto.comments = comments_for_photo;
                                  //photo_array.push(newPhoto);
                                  photo_array = photo_array.concat([newPhoto]);
                                  finishedProcessingPhoto();
                                }
                              }
                             );
                 },
                 function (err){
                   if (err) {
                     console.log("Cannot accumulate all photos into array!");
                     response.status(400).end("Cannot accumulate all photos into array!");
                     return;
                   }
                   if (photo_array.length === 0) {
                     response.status(400).end('Missing Output PhotoArray');
                     return;
                   }
                   response.status(200).end(JSON.stringify(photo_array));
      });
    });
  }
  else {
    response.status(401).end('unauthorized');
  }
});

// Login handler route can store into httpRequest.session.user_id
// All other handlers read httpRequest.session.user_id (If not set error or redirecto to login page. otherwise we know who is logged in)
app.post('/admin/login', function(request, response){
  var login_name = request.body.login_name;
  var password = request.body.password;
  // We want to check if we can find a user that has the login name in the database
  if (!login_name || !password){
    response.status(400).end('Either login_name or password is missing!');
    return;
  }
  User.findOne({login_name: login_name, password: password}, 'first_name last_name _id login_name password', function(err, user)
  {
    if (err) {
        // Query returned an error.  We pass it back to the browser with an Internal Service
        // Error (500) error code.
        console.error('Doing /user/:id error:', err);
        response.status(400).end(JSON.stringify(err));
        return;
    }
    if (!user){
      response.status(400).end('Missing the user with login_name:' + login_name);
      return;
    }
    //console.log("Yay! I found user with id " + login_name);
    request.session.user_id = user._id;
    request.session.login_name = user.login_name;
    //åconsole.log("Just saved user_id and login_name into the express session");
    response.status(200).end(JSON.stringify(user));
  });
});
/*
app.post('/admin/logout', function(request, response){
    console.log("Log out!");
    request.session.user_id = null;
    request.session.login_name = null;
    request.session.destroy(function (err){
      console.error(err);
      if (err)
      {
        response.status(400).end('Error destroying the request session');
        console.log("Error destroying the request session!");
        console.log(err);
        return;
      }
      else {
        console.log("Successfully logged out!");
        response.status(200).end("Logged out");
        return;
      }
    });
});
*/
var server = app.listen(3000, function () {
    var port = server.address().port;
    console.log('Listening at http://localhost:' + port + ' exporting the directory ' + __dirname);
});

app.post('/photos/new',function(request, response){
  if (request.session.user_id) {
  processFormBody(request, response, function (err) {
    if (err || !request.file) {
        // XXX -  Insert error handling code here.
        console.log('Error occurred or requestfile is missing.');
        response.status(400).end('Error occurred or requestfile is missing.');
        return;
    }
    // request.file has the following properties of interest
    //      fieldname      - Should be 'uploadedphoto' since that is what we sent
    //      originalname:  - The name of the file the user uploaded
    //      mimetype:      - The mimetype of the image (e.g. 'image/jpeg',  'image/png')
    //      buffer:        - A node Buffer containing the contents of the file
    //      size:          - The size of the file in bytes

    // XXX - Do some validation here.
    // We need to create the file in the directory "images" under an unique name. We make
    // the original file name unique by adding a unique prefix with a timestamp.
    if (!request.file.originalname || !request.file.buffer) {
      console.log("Name of uploaded file is missing or node Buffer containing contents of file is missing.");
      response.status(400).end("Name of uploaded file is missing or node Buffer containing contents of file is missing.");
      return;
    }
    var timestamp = new Date().valueOf();
    var filename = 'U' +  String(timestamp) + request.file.originalname;

    fs.writeFile("./images/" + filename, request.file.buffer, function (err) {
      // XXX - Once you have the file written into your images directory under the name
      // filename you can create the Photo object in the database
      Photo.create({
        file_name: filename,
        date_time: timestamp,
        user_id: request.session.user_id,
        comments: []
      }, function (err, photo) {
        if (err) {
          console.log("Backend could not process the uploaded photo!");
          console.log(err);
          response.status(400).end("Backend could not process the uploaded photo!");
          return;
        }
        else {
          console.log(photo);
          photo.save(function (err){
            if (err)
            {
              console.log("Processed photo could not be saved by backend");
              response.status(400).end("Processed photo could not be saved by backend.");
              console.log(err);
              return;
            }
            else
            {
              console.log("Backend has saved the photo!");
              response.status(200).end("Backend has saved the photo!");
            }
          });
        }
      });
    });
  });
  }
  else {
    response.status(401).end('unauthorized');
  }
});

app.post('/commentsOfPhoto/:photo_id', function(request, response){
  if (request.session.user_id) {
  if (!request.body.comment) {
    response.status(400).end('No comment property was found on user input comment.');
    return;
  }
  if (request.body.comment.length === 0) {
    response.status(400).end('Empty comment was received by server!');
    return;
  }
  Photo.findOne({_id:request.params.photo_id}, function(err, photo) {
    if (err) {
        //console.error('Doing /photosOfUser/:photo_id error:', err);
        response.status(400).end(JSON.stringify(err));
        return;
    }
    if (!photo){
      response.status(400).end("Missing photo by specified photo_id" + request.params.photo_id);
      return;
    }
    var addedComment = {comment: request.body.comment, user_id: request.session.user_id,};
    //console.log(photo.comments);
    photo.comments = photo.comments.concat([addedComment]);
    //photo.comments.push(addedComment);
    // Database lecture slide "Model used for querying collection" user.save
    //console.log("new photo comment contains: ");
    //console.log(photo.comments);
    photo.markModified('comments');
    photo.save(function(error){
      if (error){
        response.status(400).end("Backend can't save the added comment!");
        console.log("I can't save the added comment!");
        console.log(error);
      }
      else {
        console.log("I have saved the comment!");
        response.status(200).end(JSON.stringify(photo));
      }
    });
    //console.log("hello here!");
    //console.log(photo);
    //response.status(200).end();
  });
  }
  else {
    response.status(401).end('unauthorized');
  }
});

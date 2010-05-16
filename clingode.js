#!/usr/bin/env node

var sys  = require('sys');
var dns  = require('dns');
var url  = require('url');
var http = require('http');
var child_process = require('child_process');

var CLINGO_BINARY = process.env['CLINGO_BINARY'] || 'clingo';
var PORT = process.env['PORT'] || 9229;

var scoreboard = {};

var handlers = {
  '/solve': handle_solve,
  '/jobs': handle_jobs,
  '/kill': handle_kill
};

http.createServer(function(request, response) {
  var handler = handlers[url.parse(request.url).pathname];
  if(handler === undefined) {
    handle_notFound(request, response);
  } else {
    handler(request, response);
  }
}).listen(PORT);

sys.puts('server on port '+PORT);

function handle_notFound(request, response) {
  response.writeHead(404);
  response.end();
}
function handle_jobs(request, response) {
  response.writeHead(200, {'content-type': 'text/html', 'refresh':'1'});

  response.write("<html>\n");
  response.write("  <head><title>jobs</title>\n");
  response.write("  <body>\n");
  response.write("    <h1>jobs, kill one?</h1>\n");
  response.write("    <table>\n");
  
  for(var pid in scoreboard) {
    var job = scoreboard[pid];
    response.write("      <tr><td><a href=\"/kill?pid="+pid+"\">pid="+pid+" "+job.client+"</a></td><tr>\n");
  }

  response.write("    </table>\n");
  response.write("  </body>\n");

  response.end();
}

function handle_kill(request, response) {
  response.writeHead(302, {'location': '/jobs'});
  setTimeout(function() {
    response.end();
  }, 250); // give the proc a chance to die first

  var pid = url.parse(request.url,true).query.pid; 
  var job = scoreboard[pid];
  if(job) { // might already be gone
    job.proc.kill();
  }
}

function handle_solve(request, response) {
  response.writeHead(200, {'content-type':'text/plain'});
  
  var clingoArgs = []; 
  
  try {
    clingoArgs =  url.parse(request.url,true).query.args.split(/\s+/);
  } catch (err){};

  var proc = child_process.spawn(CLINGO_BINARY, clingoArgs);
  sys.inspect(proc);

  var pid = proc.pid;
  scoreboard[pid] = {proc: proc, client: request.connection.remoteAddress};

  dns.reverse(scoreboard[pid].client, function(err, domains) {
    if(pid in scoreboard) {
      scoreboard[pid].client = domains;
    }
  });


  response.connection.setNoDelay(true);

  request.addListener('end', function(){proc.stdin.end();});
  proc.stdout.addListener('end', function(){response.end();});

  request.addListener('data', function(data){proc.stdin.write(data);});
  proc.stdout.addListener('data', function(data){response.write(data);});
  
  request.connection.addListener('end', function(){
    proc.kill();
  });

  response.connection.addListener('end', function() {
    proc.kill();
  });

  proc.addListener('exit', function(code, signal) {
    delete scoreboard[pid];
  });
}

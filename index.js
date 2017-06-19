const Hapi = require('hapi');
const Muckraker = require('muckraker');
const Config = require('getconfig');

const Routes = require('./routes');


const server = new Hapi.Server();
const db = new Muckraker({ connection: Config.db })
server.connection(Config.server)


server.register([
  {
    register: require('good'),
    options: Config.good
  },
  {
    register: require('hapi-auth-basic')
  }
]).then(() => {

  server.auth.strategy('prosody', 'basic', {
    validateFunc: require('./lib/prosodyAuth')
  });

  server.start((err) => {
    if (err) throw err;
  
    console.log(`Server running at ${server.info.uri}`);
  })
  
  server.route(Routes);
});


const Hapi = require('hapi');
const Muckraker = require('muckraker');
const Config = require('getconfig');
const Proxy = require('http-proxy');

const inflateDomains = require('./lib/domains');
const buildUrl = require('./lib/buildUrl');
const Domains = inflateDomains(Config.talky.domains);
const ProsodyAuth = require('./lib/prosodyAuth');
const ResetDB = require('./lib/resetDB');

const Routes = require('./routes');
const Pkg = require('./package.json');


const server = new Hapi.Server();
const db = new Muckraker({ connection: Config.db });
server.connection(Config.server);


const wsPort = Config.isDev ? (Config.isDevTLS ? 5281: 5280): 5281;
const wsProxy = Proxy.createProxyServer({ target: `${buildUrl('ws', Domains.api, wsPort)}` });
wsProxy.on('error', (err) => {
  server.log(err, 'Prosody not responding');
});

module.exports = server.register([
  {
    register: require('good'),
    options: Config.good
  },
  {
    register: require('hapi-auth-basic')
  },
  {
    register: require('hapi-auth-jwt2')
  },
  {
    register: require('vision')
  },
  {
    register: require('inert')
  },
  {
    register: require('hapi-swagger'),
    options: {
      grouping: 'tags',
      info: {
        title: Pkg.description,
        version: Pkg.version,
        contact: {
          name: '&yet',
          email: 'talky@andyet.com'
        },
        license: {
          name: Pkg.license
        }
      }
    }
  }
])
  .then(ResetDB(db))
  .then(() => {

    server.auth.strategy('prosody-guests', 'basic', {
      validateFunc: ProsodyAuth('guests')
    });

    server.auth.strategy('prosody-users', 'basic', {
      validateFunc: ProsodyAuth('users')
    });

    server.auth.strategy('prosody-bots', 'basic', {
      validateFunc: ProsodyAuth('bots')
    });

    server.auth.strategy('prosody-api', 'basic', {
      validateFunc: ProsodyAuth('api')
    });

    server.auth.strategy('client-token', 'jwt', {
      key: Config.auth.secret,
      validateFunc: (decoded, request, cb) => cb(null, true),
      verifyOptions: {
        algorithms: [ 'HS256' ],
        issuer: Domains.api
      }
    });

    server.views({
      engines: { pug: require('pug') },
      path: `${__dirname}/views`,
      isCached: !Config.isDev
    });

    server.listener.on('upgrade', (req, socket, head) => {
      wsProxy.ws(req, socket, head);
    });

    server.start((err) => {
      if (err) throw err;

      server.log(['info'], `Server running at ${server.info.uri}`);
    });

    server.bind({ db })
    server.route(Routes);


    if (Config.isDev && !Config.noProsody) {
      const prosody = require('./scripts/start-prosody').startProsody(process);
      prosody.stdout.pipe(process.stdout);
    }
    return server;
  });

/*
process.on('unhandledException', function () {
  console.log(arguments);
  process.exit();
});

process.on('unhandledRejection', function () {
  console.log(arguments);
  process.exit();
});
*/


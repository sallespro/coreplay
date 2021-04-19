const http = require("http");
const hypercore = require("hypercore");
const { toPromises } = require("hypercore-promisifier");
const hyperswarm = require("hyperswarm");
const ram = require("random-access-memory");
const pump = require("pump");
const browserify = require("browserify");
const moment = require("moment");

moment.locale("en");

async function createCore() {
  const core = toPromises(hypercore(ram, { valueEncoding: "utf-8" }));

  await core.ready();

  core.createReadStream({ live: true }).on("data", (chunk) => {
    console.log("server read stream",chunk.toString());
  });

  const cleanup = async () => {
    await core.close();
  };
  return { core, cleanup };
}

async function fillUp(core) {

  for (let i = 0; i < 100; i++) {
    await core.append(`content ${i}`);
  }
  console.log(" block  0 ", await core.get(0));
  console.log(" block ", core.length, await core.get(core.length - 1));
  console.log(" total ", core.length, "blocks");

}

async function Connect(core) { 

  const sw = hyperswarm();

  sw.join(core.discoveryKey, {
    lookup: true, // find & connect to peers
    announce: true // optional- announce self as a connection target
  });

  sw.on("connection", (conn, info) => {
    console.log("\nswarm on connection\n");
    //setInterval(() => core.append("server live content " + Date.now()), 1000);
    if (info.peer) {
      //console.log(chalk.green("\nRemote Replicate\n"));
      console.log("server connected to ", JSON.stringify(info.peer));
      const stream = core.replicate(true, { live: true });
      pump(stream, conn, stream);

      //setInterval(() => core.append("live content " + Date.now()), 2000);
    }
  });

}

async function start() {
  const { core } = await createCore();

  await core.ready();
  console.log(
    "Hypercore ready\n",
    moment().utcOffset(-180).format("LLLL"),
    "\n key",
    core.key.toString("hex")
  );
  return core
}

async function kick() {
  const core = await start();
  //const publickey = core.key.toString("hex")
  http.createServer(makeCallback(core)).listen(8080);
  await fillUp(core);
  
}

kick();

function makeCallback(core) {
  const publickey = core.key.toString("hex")
  return async function (req, res) {
    const { method, url, headers } = req;

    if (req.url === "/") {
      const Data = moment().utcOffset(-180).format("LLLL");
      console.log("SSR client app HTML served");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><head><script src="bundle.js"></script></head>`+
        `<body>`+
        `<h3>coreplay</h3>`+
        `<h3>server side hypercore <a href="https://krc1s.sse.codesandbox.io/"> https://krc1s.sse.codesandbox.io/</a></h3>`+
        `<p> Pubkey ` + publickey +`</p>`+
        `<h3> created at` + Data +`</h3>`+
        `</body>`+
        `</html>`
      );
    }

    if (req.url === "/bundle.js") {
      console.log("Browserify client app bundle.js");
      res.setHeader("content-type", "application/javascript");
      var b = browserify(__dirname + "/client.js")
        //.transform("babelify", {presets: ["@babel/preset-env"]})
        .bundle();
      b.on("error", console.error);
      b.pipe(res);
    } //else res.writeHead(404, "not found");

    if (method === "GET" && url === "/key") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Origin", "*");

      console.log("client app fetching publickey");
      await Connect(core);
      const responseBody = {
        headers,
        method,
        url,
        body: publickey
      };

      res.write(JSON.stringify(responseBody));
      res.end();
    }
  };
}

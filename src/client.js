const hyperswarm = require("hyperswarm-web");
const hypercore = require("hypercore");
const ram = require("random-access-memory");
const pump = require("pump");
const { toPromises } = require("hypercore-promisifier");

const sw = hyperswarm();

async function createCore() {
  const response = await fetch("https://krc1s.sse.codesandbox.io/key");
  const payload = await response.json();
  const publicKey = payload.body;
  console.log("fetch server hypercore key ", publicKey);
  const core = toPromises(
    hypercore(ram, publicKey, { valueEncoding: "utf-8" })
  );

  await core.ready();

  const cleanup = async () => {
    await core.close();
  };
  return { core, cleanup };
}

async function main() {
  console.log("creating browser hypercore");
  const { core } = await createCore();
  console.log("listening browser hypercore updates");
  core.createReadStream({ live: true }).on("data", (chunk) => {
    console.log(chunk.toString());
  });

  sw.join(core.discoveryKey, {
    lookup: true, // find & connect to peers
    announce: true // optional- announce self as a connection target
  });

  console.log("waiting for connection");

  sw.on("connection", (conn, info) => {
    console.log("client connected to peer ", info.peer.host);
    const stream = core.replicate(false, { live: true });
    pump(stream, conn, stream);


  });
}

main();

import { readFileSync, writeFileSync } from "fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));

const newVersion = manifest.version;
const appVersion = manifest.minAppVersion;

versions[newVersion] = appVersion;

writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

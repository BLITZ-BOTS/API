/* this is not a proper test, but im going to use it for now */
import fs from "fs";
const { PORT } = Bun.env;

const form = new FormData();

form.append("name", "test--plugin45");
form.append("description", "A test plugin (random zip i found on my pc)");
form.append("version", "1.0.0");
form.append("author", "testuser");
form.append("tags", "test,demo");

form.append("file", new Blob([fs.readFileSync("./test-plugin.zip")]), "test-plugin.zip");

const response = await fetch(`http://localhost:${PORT ?? 3000}/plugins`, {
  method: "POST",
  body: form,
  headers: {
    Authorization: "Bearer " + "gg",
  },
});

const { status, statusText } = response;
console.log({ status, statusText });
console.log(await response.json());

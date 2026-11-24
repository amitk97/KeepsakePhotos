// Paints with free public FLUX Kontext artists on Hugging Face, straight from the guest's phone,
// using each Space's standard Gradio API (the same one behind its "Use via API" button):
//   1. upload the photo        POST {space}/gradio_api/upload
//   2. ask for a painting      POST {space}/gradio_api/call/{fn}   → event id
//   3. wait for the result     GET  {space}/gradio_api/call/{fn}/{id}  (a stream of events)
//   4. download the painting
// Older Gradio versions use the same paths without "/gradio_api"; both are tried.
// If one artist is busy, asleep, out of free allowance or broken, the next is tried.

import { activeSpaces, PAINT_OPTIONS, SPACE_TIMEOUT_MS } from "./spaces.js";

export class AllArtistsBusyError extends Error {}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function post(url, body, signal, json = true) {
  return fetch(url, {
    method: "POST",
    body: json ? JSON.stringify(body) : body,
    headers: json ? { "Content-Type": "application/json" } : undefined,
    signal,
  });
}

// Tries "/gradio_api" + path first, then the older path.
async function gradioFetch(space, path, makeRequest) {
  let res = await makeRequest(`${space.url}/gradio_api${path}`);
  if (res.status === 404) res = await makeRequest(`${space.url}${path}`);
  return res;
}

async function upload(space, photoBlob, signal) {
  const form = new FormData();
  form.append("files", photoBlob, "photo.jpg");
  const res = await gradioFetch(space, "/upload", (url) => post(url, form, signal, false));
  if (!res.ok) throw new Error(`upload ${res.status}`);
  const [path] = await res.json();
  if (!path) throw new Error("upload returned nothing");
  return { path, orig_name: "photo.jpg", mime_type: "image/jpeg", meta: { _type: "gradio.FileData" } };
}

// Reads the server-sent event stream until "complete" or "error".
async function readResult(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (event === "complete") return JSON.parse(data);
        if (event === "error") throw new Error(data && data !== "null" ? data : "the artist reported an error");
      }
    }
  }
  throw new Error("the artist stopped without a result");
}

async function paintWith(space, photoBlob, prompt) {
  const { signal, done } = withTimeout(SPACE_TIMEOUT_MS);
  try {
    const image = await upload(space, photoBlob, signal);
    const data = [image, prompt, 0, true, PAINT_OPTIONS.guidance, PAINT_OPTIONS.steps];
    const call = await gradioFetch(space, `/call/${space.fn}`, (url) => post(url, { data }, signal));
    if (!call.ok) throw new Error(`call ${call.status}`);
    const { event_id: id } = await call.json();
    if (!id) throw new Error("no event id");

    const base = call.url.replace(/\/call\/[^/]+$/, "");
    const stream = await fetch(`${base}/call/${space.fn}/${id}`, { signal });
    if (!stream.ok) throw new Error(`result ${stream.status}`);
    const [result] = await readResult(stream);

    const fileUrl = result?.url || (result?.path && `${base}/file=${result.path}`);
    if (!fileUrl) throw new Error("no painting in the result");
    const img = await fetch(fileUrl, { signal });
    if (!img.ok) throw new Error(`download ${img.status}`);
    return await img.blob();
  } finally {
    done();
  }
}

// onTry(index, total, space) is called before each artist, for progress messages.
export async function paintWithFreeArtists(photoBlob, prompt, { onTry = () => {} } = {}) {
  const spaces = activeSpaces();
  for (let i = 0; i < spaces.length; i++) {
    onTry(i + 1, spaces.length, spaces[i]);
    try {
      return { blob: await paintWith(spaces[i], photoBlob, prompt), artist: spaces[i].name };
    } catch (err) {
      console.warn(`Free artist "${spaces[i].name}" couldn't paint:`, err.message);
    }
  }
  throw new AllArtistsBusyError("No free artist could paint right now");
}

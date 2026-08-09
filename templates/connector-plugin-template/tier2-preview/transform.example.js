// NOT FUNCTIONAL — see README.md in this directory.
//
// This file is not loaded, sandboxed, or executed by Sovereign Edge or
// by anything in this template. It's a sketch of the shape a Tier 2
// transform script might take once task 5.6 (the sandboxed runtime)
// exists, kept here only so a future connector author has something
// concrete to react to — not a contract to build against yet.
//
// Speculative shape: given the parsed JSON response Tier 1's `request`
// already fetched, return the text handed to the model, in place of a
// static `response.textFrom` dotted path.
export function transform(responseBody) {
  return `Placeholder — ${JSON.stringify(responseBody)}`;
}

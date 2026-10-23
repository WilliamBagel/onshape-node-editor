# Saved graph schema (version 1)

A saved graph is a single JSON document produced by
`src/app/rete/serialization/graph-serializer.ts` and described by the types in
`src/app/rete/serialization/graph-schema-types.ts`.

```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "sV0m8y1fQ2",
      "kind": "define-feature",
      "position": { "x": 0, "y": 50 },
      "size": { "width": 220, "height": 150 },
      "group": null,
      "title": "My New Feature",
      "annotation": { "type": "Feature Type Name", "value": "My New Feature" },
      "preconditions": [
        { "annotation": { "type": "Property Function Name", "value": "do the thing" },
          "btType": "BTParameterSpecBoolean-170" }
      ]
    },
    {
      "id": "a3x9Kd2pLm",
      "kind": "CustomFeature",
      "position": { "x": 300, "y": 50 },
      "size": { "width": 220, "height": 150 },
      "group": null,
      "spec": {
        "did": null,
        "wvm": null,
        "wvmid": null,
        "eid": "6e648f0784c53a069512657b",
        "featureType": "chamfer",
        "microversion": "b47f14f24a7f43d8495cb724"
      },
      "parameters": {
        "entities": { "type": "QueryList", "value": [] },
        "width": { "type": "ValueWithUnits", "value": { "value": 1, "units": "mm" } }
      }
    },
    {
      "id": "zZ4Lk0pQr8",
      "kind": "output-feature",
      "position": { "x": 900, "y": 50 },
      "size": { "width": 220, "height": 150 },
      "group": null
    }
  ],
  "connections": [
    { "source": "sV0m8y1fQ2", "sourceOutput": "context", "target": "a3x9Kd2pLm", "targetInput": "context" },
    { "source": "a3x9Kd2pLm", "sourceOutput": "context", "target": "zZ4Lk0pQr8", "targetInput": "context" }
  ]
}
```

## Top level

| field | type | meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Format version. This build writes **1** and loads only **1**. |
| `nodes` | array | Every node on the canvas, in creation order. |
| `connections` | array | Every connection. Endpoints are node ids plus port keys. |

## Nodes

All nodes carry the same five header fields:

| field | type | meaning |
| --- | --- | --- |
| `id` | string | Rete node id. Restored on load; connection endpoints and the generator's variable disambiguation are keyed by it. |
| `kind` | `"CustomFeature"` \| `"define-feature"` \| `"output-feature"` | Node class discriminant (`OnshapeNode.type`). |
| `position` | `{x, y}` or `null` | Canvas position. Owned by the rete area plugin, not the node, so the graph serializer fills it from the caller's placement map. `null` means "no known position". |
| `size` | `{width, height}` | Node box size (`OnshapeNode.width` / `.height`). |
| `group` | string or `null` | Frame/group id. No grouping exists yet (#13); the field is written and restored so grouping does not need a schema bump. |

### `kind: "CustomFeature"` — a call to an Onshape custom feature

| field | type | meaning |
| --- | --- | --- |
| `spec` | `FeatureSpecReference` | Where the feature spec lives. |
| `parameters` | `Record<parameterId, SerializedParameterValue>` | Current control values, by parameter id. |

`spec` is a **reference, never the spec body**:

| field | type | meaning |
| --- | --- | --- |
| `did` | string or null | Onshape document id, when known. |
| `wvm` | `"w"` \| `"v"` \| `"m"` \| null | Document selector: workspace, version, microversion. |
| `wvmid` | string or null | Workspace/version/microversion id. |
| `eid` | string or null | Element (Feature Studio) id. |
| `featureType` | string | FeatureScript feature type, e.g. `chamfer`. |
| `microversion` | string or null | Element microversion the spec was read at. |

`eid` and `microversion` are parsed from `BTFeatureSpec.namespace`
(`e<eid>::m<microversion>`), which is the same encoding
`CustomFeatureNode.getDependencies` turns into `import(path: ...)` lines.
`did`/`wvm`/`wvmid` are recorded when the caller knows the document; specs read
through `getFeatureStudioSpecs` currently carry `null` there.

The spec body is deliberately not stored. `BTFeatureSpec-129` is a
1,000-line Onshape document; embedding it in every saved graph would freeze a
stale copy into the file and make graphs unmergeable. `CustomFeatureNode.fromJSON`
resolves the reference through a `SpecResolver` supplied by the caller — the spec
library / API in the app, a fixture in tests — and refuses the load when the spec
cannot be resolved.

`SerializedParameterValue` is `{ type, value }`, where `type` is
`OnshapeInputControl.type` and `value` is `getCurrentValue()`:

| `type` | `value` |
| --- | --- |
| `ValueWithUnits` | `{ "value": number, "units": string }` |
| `Enum` | option string (the enum name comes from the resolved spec) |
| `Boolean` | boolean |
| `String` | string |
| `QueryList` | always `[]` — see DR-001 below |

Values are **read from the control** on save and pushed back through
`OnshapeNode.updateParameter` on load. The node is not the source of truth; the
control on the input is.

**DR-001:** a transient selection captured with
`ClientMessaging.requestSelection()` is invalidated by the next document edit, so
it must never be persisted. `QueryList` parameters are written as an empty
selection list and regenerate as `qUnion([])`. Persisted queries must come from
explicit `Query` connections or re-evaluated queries, not from captured
selection ids.

### `kind: "define-feature"`

| field | type | meaning |
| --- | --- | --- |
| `title` | string | Node/feature title. |
| `annotation` | `{ type, value }` | The `annotation { ... }` line above the generated `defineFeature`. |
| `preconditions` | `{ annotation, btType }[]` | Generated `precondition { ... }` entries. |

### `kind: "output-feature"`

No extra fields; it is the terminator for codegen.

## Connections

```json
{ "source": "<node id>", "sourceOutput": "<output key>", "target": "<node id>", "targetInput": "<input key>" }
```

Port keys are the same keys the app uses (`context`, `id`, `definition`,
`definition.<precondition>`, or a parameter id for a connected parameter). The
loader rejects a connection whose node or port does not exist instead of
dropping it silently.

## Versioning and refusal behavior

`GRAPH_SCHEMA_VERSION` is `1`.

`deserializeGraph()` **never throws and never migrates**. It returns:

```ts
type LoadGraphResult =
  | { ok: true; graph: { nodes, connections, positions } }
  | { ok: false; error: string };
```

An unsupported `schemaVersion` produces a clear refusal:

```
Unsupported graph schemaVersion: 2. This build supports schemaVersion 1;
refusing to load the graph.
```

The same `ok: false` path is used for a missing/non-integer version, a malformed
document, an unknown node `kind`, a duplicate node id, a dangling connection, an
unknown port, and an unresolvable spec reference. Nothing is partially loaded
into the editor: the caller gets either a complete graph or an error string.

## API

```ts
const json  = serializeGraph(editor, positions);      // positions: Record<nodeId, {x,y}|null>
const loaded = deserializeGraph(json, { resolveSpec }); // object, already JSON-safe
const loaded2 = deserializeGraphText(text, { resolveSpec });

if (loaded.ok) {
  await applyGraph(editor, loaded.graph);             // adds nodes + connections, restores connection state
}
```

`applyGraph` reproduces the `connectioncreate` side effects that `editorbase`
installs as an editor pipe, so codegen sees the same internal state whether a
graph was built interactively or loaded from disk.

## Tests

`src/app/rete/__tests__/graph-schema.test.ts`:

- builds a fixture graph (define → custom feature → output), generates
  FeatureScript, serializes, deserializes and regenerates, and asserts the two
  generated sources are byte-identical;
- asserts the reference round-trips without a spec body;
- asserts an unknown `schemaVersion` is refused with the message above and
  constructs no nodes.

//! GBNF grammar construction for tool-calling (task 12.7a).
//!
//! Mobile's tool-calling rides on `llama.rn`'s own jinja/tool-template
//! machinery: given a model whose GGUF chat template declares tool support
//! (`chatTemplates.jinja.defaultCaps.tools`), `llama.rn` converts each
//! tool's JSON Schema into a grammar internally and exposes an OpenAI-style
//! `tools`/`tool_choice`/`tool_calls` surface
//! (`apps/mobile/src/chat/inference/engine.ts`). `llama-cpp-2` (the crate
//! this port uses, chosen in task 12.2) exposes no such thing — only the
//! low-level GBNF grammar sampler primitives
//! (`llama_cpp_2::sampling::LlamaSampler::grammar`) and no JSON-Schema→GBNF
//! converter, and no chat-template tool-capability introspection. Building
//! both pieces is this module's job.
//!
//! **Deliberate protocol difference from mobile, not an oversight:**
//! instead of reproducing llama.cpp's native `<tool_call>`/OpenAI chat-role
//! tool syntax (which would mean re-implementing its jinja chat-template
//! tool-rendering by hand), this module defines its own fixed decision
//! envelope and forces the model to emit exactly one of:
//!
//! ```json
//! {"answer": "<free text>"}
//! {"tool_call": {"name": "<one of the offered tool names>", "arguments": {...}}}
//! ```
//!
//! and constrains decoding to that shape with a GBNF grammar built fresh
//! per call from the offered tools. This makes tool-calling here
//! **model-agnostic** — it works for any instruction-following model, not
//! only ones whose GGUF chat template happens to declare tool support —
//! which is why `EngineInfo::tool_capable` is unconditionally `true` once a
//! model is loaded (see `adapter.rs`), unlike mobile's template-dependent
//! flag.
//!
//! **Scope limitation, checked not assumed:** only a flat JSON-Schema
//! object with `string`/`number`/`integer`/`boolean` properties is
//! supported, and every property is treated as present in the emitted
//! object (no grammar-level support for optional properties yet). A
//! connector manifest whose `tool.parameters` needs more than that fails
//! `build_decision_grammar` with a clear [`GrammarError`] rather than
//! silently building a grammar that can't actually represent the schema.

use super::types::ToolChoice;
use serde_json::{Map, Value};

#[derive(Debug, thiserror::Error)]
pub enum GrammarError {
    #[error("build_decision_grammar was called with no tools offered")]
    NoTools,
    #[error("tool \"{tool}\" declares parameter \"{property}\" as required, but it has no entry in \"properties\"")]
    MissingRequiredProperty { tool: String, property: String },
    #[error("tool \"{tool}\"'s parameter \"{property}\" has type \"{type_name}\", which this engine's grammar builder does not support (only string, number, integer, boolean)")]
    UnsupportedPropertyType {
        tool: String,
        property: String,
        type_name: String,
    },
    #[error("tool \"{tool}\"'s parameter \"{property}\" has no \"type\" field")]
    MissingPropertyType { tool: String, property: String },
}

/// One tool as this module needs it — just enough to build both the
/// grammar and (in `adapter.rs`) the corresponding branch of the decision
/// object. Deliberately not `crate::connectors::manifest::ToolDefinition`:
/// that type belongs to the connector-manifest schema; this one belongs to
/// the engine, exactly like mobile keeps `chat/inference/types.ts`'s
/// `ToolDefinition` and `connectors/manifest/schema.ts`'s tool shape as two
/// separate types bridged by `routing/route.ts`.
#[derive(Debug, Clone)]
pub struct ToolSchema {
    pub name: String,
    /// A JSON-Schema object: `{"type": "object", "properties": {...},
    /// "required": [...]}`. Only the subset described in this module's own
    /// doc comment is honored.
    pub parameters: Value,
}

/// Builds the GBNF text for the decision grammar described in this
/// module's doc comment. `root` is always the grammar root rule name.
pub fn build_decision_grammar(
    tools: &[ToolSchema],
    tool_choice: ToolChoice,
) -> Result<String, GrammarError> {
    if tools.is_empty() {
        return Err(GrammarError::NoTools);
    }

    let mut rules = String::new();
    let mut alternatives: Vec<String> = Vec::new();

    let obrace = gbnf_literal("{");
    let cbrace = gbnf_literal("}");
    let colon = gbnf_literal(":");
    let comma = gbnf_literal(",");
    let tool_call_key = gbnf_json_string_literal("tool_call");
    let name_key = gbnf_json_string_literal("name");
    let arguments_key = gbnf_json_string_literal("arguments");
    let answer_key = gbnf_json_string_literal("answer");

    for (i, tool) in tools.iter().enumerate() {
        let args_rule = format!("tool-{i}-args");
        let call_rule = format!("tool-{i}-call");
        rules.push_str(&object_schema_rule(&args_rule, tool)?);
        rules.push('\n');
        let name_literal = gbnf_json_string_literal(&tool.name);
        rules.push_str(&format!(
            "{call_rule} ::= {obrace} ws {tool_call_key} ws {colon} ws {obrace} ws {name_key} ws {colon} ws {name_literal} ws {comma} ws {arguments_key} ws {colon} ws {args_rule} ws {cbrace} ws {cbrace}\n"
        ));
        alternatives.push(call_rule);
    }

    if matches!(tool_choice, ToolChoice::Auto) {
        alternatives.push("answer-call".to_string());
        rules.push_str(&format!(
            "answer-call ::= {obrace} ws {answer_key} ws {colon} ws string ws {cbrace}\n"
        ));
    }

    let root = format!("root ::= {}\n", alternatives.join(" | "));

    Ok(format!(
        "{root}{rules}\n{}",
        JSON_PRIMITIVES_GBNF.trim_start()
    ))
}

/// Standard GBNF primitives for JSON strings/numbers/booleans/whitespace —
/// hand-written against the public GBNF grammar syntax llama.cpp defines
/// (see llama.cpp's own `grammars/README.md`), not copied from any
/// particular grammar file, since this only needs the handful of
/// primitives the decision envelope actually uses.
const JSON_PRIMITIVES_GBNF: &str = r#"
ws ::= [ \t\n]*
string ::= "\"" ( [^"\\] | "\\" ["\\/bfnrt] )* "\""
number ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)? ([eE] [-+]? [0-9]+)?
boolean ::= "true" | "false"
"#;

/// A GBNF string literal (with the enclosing quotes GBNF syntax needs)
/// that matches `text` verbatim.
fn gbnf_literal(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

/// A GBNF literal matching the *JSON-quoted* form of `s` — i.e. the exact
/// text that appears in a JSON document for the string `s`, quote
/// characters included. Composed from [`gbnf_literal`] rather than
/// hand-escaped, so JSON-escaping and GBNF-escaping each happen exactly
/// once, in one place.
fn gbnf_json_string_literal(s: &str) -> String {
    let json_escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    gbnf_literal(&format!("\"{json_escaped}\""))
}

/// Builds `{rule_name} ::= "{" ws "\"prop1\"" ws ":" ws <type> ws "," ... "}"`
/// for a flat object schema, in `required`'s declared order (falling back
/// to `properties`' own iteration order — deterministic, since
/// `serde_json::Map` without the `preserve_order` feature is a `BTreeMap`
/// — when no `required` list is given).
fn object_schema_rule(rule_name: &str, tool: &ToolSchema) -> Result<String, GrammarError> {
    let empty = Map::new();
    let properties = tool
        .parameters
        .get("properties")
        .and_then(Value::as_object)
        .unwrap_or(&empty);

    let order: Vec<String> = match tool.parameters.get("required").and_then(Value::as_array) {
        Some(required) => required
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect(),
        None => properties.keys().cloned().collect(),
    };

    let mut fields = Vec::with_capacity(order.len());
    for property in &order {
        let Some(schema) = properties.get(property) else {
            return Err(GrammarError::MissingRequiredProperty {
                tool: tool.name.clone(),
                property: property.clone(),
            });
        };
        let type_rule = property_type_rule(tool, property, schema)?;
        let key_literal = gbnf_json_string_literal(property);
        let colon = gbnf_literal(":");
        fields.push(format!("{key_literal} ws {colon} ws {type_rule}"));
    }

    let obrace = gbnf_literal("{");
    let cbrace = gbnf_literal("}");
    let comma = gbnf_literal(",");
    let body = if fields.is_empty() {
        format!("{obrace} ws {cbrace}")
    } else {
        format!(
            "{obrace} ws {} ws {cbrace}",
            fields.join(&format!(" ws {comma} ws "))
        )
    };

    Ok(format!("{rule_name} ::= {body}\n"))
}

fn property_type_rule(
    tool: &ToolSchema,
    property: &str,
    schema: &Value,
) -> Result<&'static str, GrammarError> {
    let Some(type_name) = schema.get("type").and_then(Value::as_str) else {
        return Err(GrammarError::MissingPropertyType {
            tool: tool.name.clone(),
            property: property.to_string(),
        });
    };
    match type_name {
        "string" => Ok("string"),
        "number" => Ok("number"),
        "integer" => Ok("number"),
        "boolean" => Ok("boolean"),
        other => Err(GrammarError::UnsupportedPropertyType {
            tool: tool.name.clone(),
            property: property.to_string(),
            type_name: other.to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn search_tool() -> ToolSchema {
        ToolSchema {
            name: "search".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            }),
        }
    }

    #[test]
    fn builds_grammar_with_answer_alternative_when_auto() {
        let grammar = build_decision_grammar(&[search_tool()], ToolChoice::Auto).unwrap();
        assert!(grammar.starts_with("root ::= tool-0-call | answer-call"));
        assert!(grammar.contains("answer-call ::="));
        assert!(grammar.contains("tool-0-args ::="));
        assert!(grammar.contains("\\\"query\\\""));
    }

    #[test]
    fn omits_answer_alternative_when_required() {
        let grammar = build_decision_grammar(&[search_tool()], ToolChoice::Required).unwrap();
        assert!(grammar.starts_with("root ::= tool-0-call\n"));
        assert!(!grammar.contains("answer-call"));
    }

    #[test]
    fn no_tools_is_an_error() {
        assert!(build_decision_grammar(&[], ToolChoice::Auto).is_err());
    }

    #[test]
    fn missing_required_property_is_an_error() {
        let tool = ToolSchema {
            name: "broken".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": ["missing"],
            }),
        };
        let err = build_decision_grammar(&[tool], ToolChoice::Auto).unwrap_err();
        assert!(matches!(err, GrammarError::MissingRequiredProperty { .. }));
    }

    #[test]
    fn unsupported_property_type_is_an_error() {
        let tool = ToolSchema {
            name: "broken".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {"nested": {"type": "object"}},
                "required": ["nested"],
            }),
        };
        let err = build_decision_grammar(&[tool], ToolChoice::Auto).unwrap_err();
        assert!(matches!(err, GrammarError::UnsupportedPropertyType { .. }));
    }

    #[test]
    fn multiple_tools_each_get_their_own_call_rule() {
        let mut second = search_tool();
        second.name = "weather".to_string();
        let grammar = build_decision_grammar(&[search_tool(), second], ToolChoice::Auto).unwrap();
        assert!(grammar.contains("tool-0-call"));
        assert!(grammar.contains("tool-1-call"));
        assert!(grammar.contains("\\\"search\\\""));
        assert!(grammar.contains("\\\"weather\\\""));
    }
}

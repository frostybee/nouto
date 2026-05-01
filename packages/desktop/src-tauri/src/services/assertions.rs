use crate::models::http::AssertionEvalResult;
use crate::models::types::ResponseData;
use crate::services::script_engine::VariableToSet;
use serde_json::Value;

/// Evaluate assertions against a response, returning results and any variables to set
pub fn evaluate_assertions(assertions: &[Value], response: &ResponseData) -> AssertionEvalResult {
    let mut results = Vec::new();
    let mut variables_to_set = Vec::new();

    for assertion in assertions {
        let enabled = assertion["enabled"].as_bool().unwrap_or(false);
        if !enabled { continue; }

        let id = assertion["id"].as_str().unwrap_or("").to_string();
        let target = assertion["target"].as_str().unwrap_or("");
        let operator = assertion["operator"].as_str().unwrap_or("equals");
        let expected = assertion["expected"].as_str().map(|s| s.to_string());
        let property = assertion["property"].as_str().map(|s| s.to_string());

        match target {
            "schema" => {
                let (passed, message) = evaluate_schema_assertion(assertion, response);
                results.push(serde_json::json!({
                    "assertionId": id,
                    "passed": passed,
                    "actual": null,
                    "expected": assertion["expected"].as_str(),
                    "message": message,
                }));
                continue;
            }
            "setVariable" => {
                let var_name = match assertion["variableName"].as_str().filter(|s| !s.is_empty()) {
                    Some(n) => n.to_string(),
                    None => {
                        results.push(serde_json::json!({
                            "assertionId": id, "passed": false,
                            "actual": null, "expected": null,
                            "message": "setVariable requires a variableName",
                        }));
                        continue;
                    }
                };
                let extracted = property.as_deref()
                    .and_then(|prop| extract_json_path(&response.data, prop));
                match extracted {
                    Some(val) => {
                        variables_to_set.push(VariableToSet {
                            key: var_name,
                            value: val.clone(),
                            scope: "environment".to_string(),
                        });
                        results.push(serde_json::json!({
                            "assertionId": id, "passed": true,
                            "actual": val, "expected": null,
                            "message": "Variable extracted successfully",
                        }));
                    }
                    None => {
                        results.push(serde_json::json!({
                            "assertionId": id, "passed": false,
                            "actual": null, "expected": null,
                            "message": format!("Could not extract value at path '{}'",
                                property.as_deref().unwrap_or("")),
                        }));
                    }
                }
                continue;
            }
            _ => {}
        }

        let actual = match target {
            "status" => Some(response.status.to_string()),
            "responseTime" => Some(response.duration.to_string()),
            "responseSize" => Some(response.size.to_string()),
            "body" => {
                match &response.data {
                    Value::String(s) => Some(s.clone()),
                    other => Some(other.to_string()),
                }
            }
            "header" => {
                if let Some(prop) = &property {
                    let prop_lower = prop.to_lowercase();
                    response.headers.iter()
                        .find(|(k, _)| k.to_lowercase() == prop_lower)
                        .map(|(_, v)| v.clone())
                } else {
                    None
                }
            }
            "contentType" => {
                response.headers.iter()
                    .find(|(k, _)| k.to_lowercase() == "content-type")
                    .map(|(_, v)| v.clone())
            }
            "jsonQuery" => {
                if let Some(prop) = &property {
                    extract_json_path(&response.data, prop)
                } else {
                    None
                }
            }
            _ => None,
        };

        let (passed, message) = compare_assertion(operator, actual.as_deref(), expected.as_deref());

        results.push(serde_json::json!({
            "assertionId": id,
            "passed": passed,
            "actual": actual,
            "expected": expected,
            "message": message,
        }));
    }

    AssertionEvalResult { results, variables_to_set }
}

/// JSONPath extraction using RFC 9535 (serde_json_path)
pub fn extract_json_path(data: &Value, path: &str) -> Option<String> {
    let parsed: Value;
    let json_data = if let Value::String(s) = data {
        match serde_json::from_str(s) {
            Ok(v) => { parsed = v; &parsed }
            Err(_) => return None,
        }
    } else {
        data
    };

    let normalized = if path.starts_with('$') {
        path.to_string()
    } else {
        format!("$.{}", path)
    };

    let Ok(jpath) = serde_json_path::JsonPath::parse(&normalized) else {
        return None;
    };

    jpath.query(json_data).first().map(|v| match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    })
}

/// Compare actual vs expected using the given operator
pub fn compare_assertion(operator: &str, actual: Option<&str>, expected: Option<&str>) -> (bool, String) {
    match operator {
        "exists" => {
            let passed = actual.is_some() && !actual.unwrap().is_empty();
            (passed, if passed { "Value exists".into() } else { "Value does not exist".into() })
        }
        "notExists" => {
            let passed = actual.is_none() || actual.unwrap().is_empty();
            (passed, if passed { "Value does not exist".into() } else { "Value exists".into() })
        }
        "equals" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = act == exp;
            (passed, if passed {
                format!("'{}' equals '{}'", act, exp)
            } else {
                format!("Expected '{}' but got '{}'", exp, act)
            })
        }
        "notEquals" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = act != exp;
            (passed, if passed {
                format!("'{}' does not equal '{}'", act, exp)
            } else {
                format!("Value equals '{}' but should not", act)
            })
        }
        "contains" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = act.contains(exp);
            (passed, if passed {
                format!("'{}' contains '{}'", act, exp)
            } else {
                format!("'{}' does not contain '{}'", act, exp)
            })
        }
        "notContains" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = !act.contains(exp);
            (passed, if passed {
                format!("Value does not contain '{}'", exp)
            } else {
                format!("Value contains '{}' but should not", exp)
            })
        }
        "greaterThan" | "lessThan" | "greaterThanOrEqual" | "lessThanOrEqual" => {
            let act_num: f64 = actual.unwrap_or("0").parse().unwrap_or(0.0);
            let exp_num: f64 = expected.unwrap_or("0").parse().unwrap_or(0.0);
            let passed = match operator {
                "greaterThan" => act_num > exp_num,
                "lessThan" => act_num < exp_num,
                "greaterThanOrEqual" => act_num >= exp_num,
                "lessThanOrEqual" => act_num <= exp_num,
                _ => false,
            };
            (passed, if passed {
                format!("{} {} {}", act_num, operator, exp_num)
            } else {
                format!("Expected {} {} {} but got {}", act_num, operator, exp_num, act_num)
            })
        }
        "matches" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = regex::Regex::new(exp).map(|re| re.is_match(act)).unwrap_or(false);
            (passed, if passed {
                format!("Value matches pattern '{}'", exp)
            } else {
                format!("Value '{}' does not match pattern '{}'", act, exp)
            })
        }
        "isJson" => {
            let act = actual.unwrap_or("");
            let passed = serde_json::from_str::<Value>(act).is_ok();
            (passed, if passed { "Value is valid JSON".into() } else { "Value is not valid JSON".into() })
        }
        "isType" => {
            let act = actual.unwrap_or("");
            let exp = expected.unwrap_or("");
            let passed = match exp {
                "string" => true,
                "number" => act.parse::<f64>().is_ok(),
                "boolean" => act == "true" || act == "false",
                "null" => act == "null",
                "array" => act.starts_with('['),
                "object" => act.starts_with('{'),
                _ => false,
            };
            (passed, if passed {
                format!("Value is of type '{}'", exp)
            } else {
                format!("Value '{}' is not of type '{}'", act, exp)
            })
        }
        "count" => {
            let act = actual.unwrap_or("");
            let count = serde_json::from_str::<Value>(act)
                .map(|v| match v {
                    Value::Array(arr) => arr.len(),
                    Value::Object(obj) => obj.len(),
                    _ => 0,
                })
                .unwrap_or(0);
            let exp_num: usize = expected.unwrap_or("0").parse().unwrap_or(0);
            let passed = count == exp_num;
            (passed, if passed {
                format!("Count is {}", count)
            } else {
                format!("Expected count {} but got {}", exp_num, count)
            })
        }
        "anyItemContains" | "anyItemStartsWith" | "anyItemEndsWith" | "anyItemEquals" => {
            let act = actual.unwrap_or("[]");
            let exp = expected.unwrap_or("");
            let items: Vec<String> = serde_json::from_str::<Value>(act)
                .ok()
                .and_then(|v| v.as_array().map(|arr| arr.iter().map(|el| match el {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                }).collect()))
                .unwrap_or_else(|| vec![act.to_string()]);
            let passed = match operator {
                "anyItemContains" => items.iter().any(|el| el.contains(exp)),
                "anyItemStartsWith" => items.iter().any(|el| el.starts_with(exp)),
                "anyItemEndsWith" => items.iter().any(|el| el.ends_with(exp)),
                "anyItemEquals" => items.iter().any(|el| el == exp),
                _ => false,
            };
            let op_label = operator.replace("anyItem", "").to_lowercase();
            (passed, if passed {
                format!("At least one array item {}s \"{}\"", op_label, exp)
            } else {
                format!("No array item {}s \"{}\"", op_label, exp)
            })
        }
        _ => {
            (false, format!("Unknown operator: {}", operator))
        }
    }
}

/// Validate the response body against a JSON Schema
fn evaluate_schema_assertion(assertion: &Value, response: &ResponseData) -> (bool, String) {
    let Some(schema_str) = assertion["expected"].as_str() else {
        return (false, "No JSON Schema provided in expected field".to_string());
    };
    let schema: Value = match serde_json::from_str(schema_str) {
        Ok(v) => v,
        Err(e) => return (false, format!("Invalid JSON Schema: {}", e)),
    };
    let body: Value = match &response.data {
        Value::String(s) => match serde_json::from_str(s) {
            Ok(v) => v,
            Err(_) => return (false, "Response body is not valid JSON".to_string()),
        },
        other => other.clone(),
    };
    let compiled = match jsonschema::JSONSchema::compile(&schema) {
        Ok(c) => c,
        Err(e) => return (false, format!("Invalid JSON Schema: {}", e)),
    };
    if compiled.is_valid(&body) {
        (true, "Response body matches the JSON Schema".to_string())
    } else {
        let msgs: Vec<String> = compiled.validate(&body)
            .unwrap_err()
            .take(3)
            .map(|e| e.to_string())
            .collect();
        (false, msgs.join("; "))
    }
}

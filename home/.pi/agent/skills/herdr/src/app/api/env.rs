use std::collections::HashMap;

pub(super) fn normalize_launch_env(
    env: HashMap<String, String>,
) -> Result<Vec<(String, String)>, (String, String)> {
    let mut normalized = Vec::with_capacity(env.len());
    for (key, value) in env {
        if key.is_empty() {
            return Err(("invalid_env".into(), "env key must not be empty".into()));
        }
        if key.contains('=') {
            return Err((
                "invalid_env".into(),
                format!("env key {key} must not contain '='"),
            ));
        }
        if key.contains('\0') {
            return Err((
                "invalid_env".into(),
                "env key must not contain NUL bytes".into(),
            ));
        }
        if value.contains('\0') {
            return Err((
                "invalid_env".into(),
                format!("env value for {key} must not contain NUL bytes"),
            ));
        }
        normalized.push((key, value));
    }
    normalized.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_launch_env_sorts_entries() {
        let env = HashMap::from([
            ("ZED".to_string(), "last".to_string()),
            ("ALPHA".to_string(), "first".to_string()),
        ]);

        assert_eq!(
            normalize_launch_env(env).unwrap(),
            vec![
                ("ALPHA".to_string(), "first".to_string()),
                ("ZED".to_string(), "last".to_string()),
            ]
        );
    }

    #[test]
    fn normalize_launch_env_rejects_invalid_keys() {
        let env = HashMap::from([("BAD=KEY".to_string(), "value".to_string())]);

        assert_eq!(normalize_launch_env(env).unwrap_err().0, "invalid_env");
    }
}

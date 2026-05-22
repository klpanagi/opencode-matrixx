# Uninstalling Matrixx

## 1. Remove the plugin from OpenCode config

Edit `~/.config/opencode/opencode.json` (or `opencode.jsonc`) and remove the matrixx plugin entry (either `"opencode-matrixx"` or the legacy `"matrixx"` form, with or without a `@<version>` suffix) from the `plugin` array:

```bash
# Using jq — strips both the current and the legacy plugin names, with or without version pins
jq '.plugin = [.plugin[] | select(
        . != "opencode-matrixx"
        and (startswith("opencode-matrixx@") | not)
        and . != "matrixx"
        and (startswith("matrixx@") | not)
    )]' \
    ~/.config/opencode/opencode.json > /tmp/oc.json && \
    mv /tmp/oc.json ~/.config/opencode/opencode.json
```

## 2. Remove configuration files (optional)

```bash
# Remove user config
rm -f ~/.config/opencode/matrixx.json ~/.config/opencode/matrixx.jsonc

# Remove project config (if exists)
rm -f .opencode/matrixx.json .opencode/matrixx.jsonc
```

## 3. Verify removal

```bash
opencode --version
# Plugin should no longer be loaded
```

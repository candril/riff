import { join } from "node:path"
import { tmpdir } from "node:os"

// A path that never exists, so every test runs on the defaults rather than whatever is in
// ~/.config/riff/config.toml on the machine running them.
process.env.RIFF_CONFIG = join(tmpdir(), "riff-tests-have-no-config", "config.toml")

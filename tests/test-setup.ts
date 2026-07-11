import { beforeEach } from "bun:test"
import { _resetForTesting } from "../src/features/session-state/state"

beforeEach(() => {
  _resetForTesting()
})

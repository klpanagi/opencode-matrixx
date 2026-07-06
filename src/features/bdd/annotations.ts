/**
 * Annotation parser for Gherkin comment lines.
 *
 * Parses structured annotations from `# @` prefixed comment lines
 * in raw Gherkin feature text. Pure function — no I/O, no side effects.
 */

export interface ApiEndpoint {
  method: string
  path: string
}

export interface ApiResponse {
  status: string
  format: string
}

export interface UiRoute {
  [key: string]: string
}

export interface UiTestId {
  [key: string]: string
}

export interface UiString {
  category: string
  key: string
  value: string
}

export interface StateVariable {
  name: string
  type: string
  default: string
}

export interface StateInitial {
  key: string
  value: string
}

export interface StatePrecondition {
  key: string
  value: string
}

export interface Annotations {
  api: {
    endpoints: ApiEndpoint[]
    responses: ApiResponse[]
  }
  ui: {
    routes: UiRoute[]
    testIds: UiTestId[]
    strings: UiString[]
  }
  state: {
    variables: StateVariable[]
    initial: StateInitial[]
    preconditions: StatePrecondition[]
  }
  assumptions: string[]
}

function createEmptyAnnotations(): Annotations {
  return {
    api: { endpoints: [], responses: [] },
    ui: { routes: [], testIds: [], strings: [] },
    state: { variables: [], initial: [], preconditions: [] },
    assumptions: [],
  }
}

function parseKeyValuePairs(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  const pairs = raw.split(/\s+/)
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=")
    if (eqIndex > 0) {
      result[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1)
    }
  }
  return result
}

/**
 * Parse BDD annotations from raw Gherkin feature text.
 *
 * Scans for comment lines starting with `# @` and extracts structured
 * annotation data into a typed Annotations object.
 *
 * @param featureText - Raw Gherkin feature text
 * @returns Parsed annotations (empty object if none found)
 */
export function parseAnnotations(featureText: string): Annotations {
  const annotations = createEmptyAnnotations()
  const lines = featureText.split("\n")

  const patterns = {
    apiEndpoint: /^#\s*@api:endpoint\s+(\S+)\s+(\S+)\s*$/,
    apiResponse: /^#\s*@api:response\s+(\S+)\s+(\S+)\s*$/,
    uiRoute: /^#\s*@ui:route\s+(.+)$/,
    uiTestId: /^#\s*@ui:testid\s+(.+)$/,
    uiString: /^#\s*@ui:string\s+(\S+)\.(\S+)=(.+)$/,
    stateVariable: /^#\s*@state:variable\s+(\S+)\s+(\S+)\s+(.+)$/,
    stateInitial: /^#\s*@state:initial\s+(\S+)=(.+)$/,
    statePrecondition: /^#\s*@state:precondition\s+(\S+)=(.+)$/,
    assumption: /^#\s*@assumption:\s*(.+)$/,
  }

  for (const line of lines) {
    const trimmed = line.trim()

    const apiEndpointMatch = trimmed.match(patterns.apiEndpoint)
    const apiResponseMatch = trimmed.match(patterns.apiResponse)
    const uiRouteMatch = trimmed.match(patterns.uiRoute)
    const uiTestIdMatch = trimmed.match(patterns.uiTestId)
    const uiStringMatch = trimmed.match(patterns.uiString)
    const stateVariableMatch = trimmed.match(patterns.stateVariable)
    const stateInitialMatch = trimmed.match(patterns.stateInitial)
    const statePreconditionMatch = trimmed.match(patterns.statePrecondition)
    const assumptionMatch = trimmed.match(patterns.assumption)

    if (apiEndpointMatch) {
      annotations.api.endpoints.push({
        method: apiEndpointMatch[1],
        path: apiEndpointMatch[2],
      })
    } else if (apiResponseMatch) {
      annotations.api.responses.push({
        status: apiResponseMatch[1],
        format: apiResponseMatch[2],
      })
    } else if (uiRouteMatch) {
      annotations.ui.routes.push(parseKeyValuePairs(uiRouteMatch[1]))
    } else if (uiTestIdMatch) {
      annotations.ui.testIds.push(parseKeyValuePairs(uiTestIdMatch[1]))
    } else if (uiStringMatch) {
      annotations.ui.strings.push({
        category: uiStringMatch[1],
        key: uiStringMatch[2],
        value: uiStringMatch[3],
      })
    } else if (stateVariableMatch) {
      annotations.state.variables.push({
        name: stateVariableMatch[1],
        type: stateVariableMatch[2],
        default: stateVariableMatch[3],
      })
    } else if (stateInitialMatch) {
      annotations.state.initial.push({
        key: stateInitialMatch[1],
        value: stateInitialMatch[2],
      })
    } else if (statePreconditionMatch) {
      annotations.state.preconditions.push({
        key: statePreconditionMatch[1],
        value: statePreconditionMatch[2],
      })
    } else if (assumptionMatch) {
      annotations.assumptions.push(assumptionMatch[1].trim())
    }
  }

  return annotations
}

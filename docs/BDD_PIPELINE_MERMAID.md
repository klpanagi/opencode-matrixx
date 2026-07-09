# BDD Pipeline — Mermaid Diagram

```mermaid
---
title: BDD Pipeline — Agent Orchestration & Tool Flow
---
flowchart TB
    %% Styles
    classDef input fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#1b5e20
    classDef agent fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#0d47a1
    classDef tool fill:#fff3e0,stroke:#e65100,stroke-width:1px,color:#bf360c
    classDef artifact fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#4a148c
    classDef output fill:#e8eaf6,stroke:#283593,stroke-width:2px,color:#1a237e
    classDef cmd fill:#fce4ec,stroke:#c62828,stroke-width:2px,color:#b71c1c
    classDef annotation fill:#f9fbe7,stroke:#827717,stroke-width:1px,color:#524c00

    %% Input
    FeatureFiles["📄 Gherkin .feature Files"]:::input
    Annotations["📝 Inline Annotations<br/><small>@api, @ui, @state, @assumption</small>"]:::annotation

    %% === PHASE 1: CONTRACT GENERATION ===
    subgraph Phase1["Phase 1 — Contract Generation"]
        direction TB

        CmdContract["🚀 /bdd-contract &lt;path/*.feature&gt;"]:::cmd

        subgraph Agent1["bdd-contract Agent (EXPENSIVE)"]
            direction TB
            A1_Model["Claude 3.5 Sonnet<br/>GPT-4o<br/><small>thinking / reasoningEffort</small>"]:::agent

            subgraph Tools1["Deterministic Tools (no hallucination)"]
                ToolParse["bdd_parse_gherkin<br/><small>@cucumber/gherkin generateMessages()</small>"]:::tool
                ToolContract["bdd_create_contract<br/><small>parseAnnotations() + AST walk + Zod validate</small>"]:::tool
            end

            A1_Model --> ToolParse
            ToolParse --> ToolContract
        end

        ContractJson["📦 Contract JSON<br/><small>schemaVersion, feature, scenarios,<br/>background, rules, annotations</small>"]:::artifact
    end

    FeatureFiles & Annotations --> CmdContract
    ToolContract --> ContractJson

    %% === PHASE 2: PARALLEL GENERATION ===
    subgraph Phase2["Phase 2 — Parallel Artifact Generation"]
        direction TB

        CmdTests["🚀 /bdd-tests &lt;contract&gt;"]:::cmd
        CmdFrontend["🚀 /bdd-frontend &lt;contract&gt;"]:::cmd
        CmdBackend["🚀 /bdd-backend &lt;contract&gt;"]:::cmd

        subgraph Agent2["Morpheus Agent + bdd-tests skill"]
            direction TB
            A2_Model["Claude 3.5 Sonnet<br/>GPT-4o"]:::agent
            A2_Skill["Skill: bdd-tests"]:::tool
            A2_Output["🧪 Cucumber Step Definitions<br/>Page Objects<br/>Given/When/Then Scaffolds"]:::output
            A2_Model --> A2_Skill --> A2_Output
        end

        subgraph Agent3["Morpheus Agent + bdd-frontend skill"]
            direction TB
            A3_Model["Claude 3.5 Sonnet<br/>GPT-4o"]:::agent
            A3_Skill["Skill: bdd-frontend"]:::tool
            A3_Output["🖥 React Components<br/>Route Mappings (@ui:route)<br/>Test IDs (@ui:testid)<br/>i18n Strings (@ui:string)<br/>Accessibility (a11y)"]:::output
            A3_Model --> A3_Skill --> A3_Output
        end

        subgraph Agent4["Morpheus Agent + bdd-backend skill"]
            direction TB
            A4_Model["Claude 3.5 Sonnet<br/>GPT-4o"]:::agent
            A4_Skill["Skill: bdd-backend"]:::tool
            A4_Output["🔧 Zod API Schemas<br/>Request/Response Types<br/>Service Functions<br/>API Endpoint Handlers"]:::output
            A4_Model --> A4_Skill --> A4_Output
        end
    end

    ContractJson --> CmdTests
    ContractJson --> CmdFrontend
    ContractJson --> CmdBackend

    CmdTests --> Agent2
    CmdFrontend --> Agent3
    CmdBackend --> Agent4

    %% === ORCHESTRATED PIPELINE ===
    CmdPipeline["🚀 /bdd-pipeline &lt;path/*.feature&gt;<br/><small>Full orchestration: contract → tests → frontend → backend</small>"]:::cmd
    FeatureFiles & Annotations -.-> CmdPipeline
    CmdPipeline -.-> ContractJson
    CmdPipeline -.-> Agent2
    CmdPipeline -.-> Agent3
    CmdPipeline -.-> Agent4

    %% Annotation Legend
    subgraph Legend["Annotation Reference"]
        direction LR
        A_api["@api:endpoint POST /login<br/>@api:response 200"]:::annotation
        A_ui["@ui:route /login<br/>@ui:testid submit-btn"]:::annotation
        A_state["@state:session token<br/>@state:initial loggedOut"]:::annotation
        A_assume["@assumption:auth jwt"]:::annotation
    end
```

## Diagram Notes

| Element | Style | Meaning |
|---------|-------|---------|
| Green border | Input | .feature files + annotations |
| Blue border | Agent | AI agent with model config |
| Orange border | Tool | Deterministic, no-AI tool |
| Purple border | Artifact | Contract JSON (single source of truth) |
| Indigo border | Output | Generated code artifacts |
| Red border | Command | Slash command entry points |

## Pipeline Summary

```
User Input           →    Phase 1 (Deterministic)     →    Phase 2 (Generative, Parallel)
.feature files            bdd-contract agent                Morpheus + bdd-tests skill    →  step defs
+ @ annotations    ───►   bdd_parse_gherkin tool      ───►  Morpheus + bdd-frontend skill →  React components
                          bdd_create_contract tool           Morpheus + bdd-backend skill  →  API services
                                    │
                                    ▼
                              Contract JSON
                              (intermediate artifact)
```

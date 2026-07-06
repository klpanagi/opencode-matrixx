import { describe, expect, test } from "bun:test"
import { parseAnnotations } from "../annotations"

describe("parseAnnotations", () => {
  //#given a single api:endpoint annotation
  test("parses single api:endpoint annotation", () => {
    //#given
    const text = `Feature: API
  # @api:endpoint GET /users
  Scenario: List users`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.api.endpoints).toHaveLength(1)
    expect(result.api.endpoints[0]).toEqual({ method: "GET", path: "/users" })
  })

  //#given a single api:response annotation
  test("parses single api:response annotation", () => {
    //#given
    const text = `Feature: API
  # @api:response 200 json
  Scenario: Success`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.api.responses).toHaveLength(1)
    expect(result.api.responses[0]).toEqual({ status: "200", format: "json" })
  })

  //#given a single ui:route annotation
  test("parses single ui:route annotation with key=value pairs", () => {
    //#given
    const text = `Feature: UI
  # @ui:route path=/dashboard component=Dashboard
  Scenario: View dashboard`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.ui.routes).toHaveLength(1)
    expect(result.ui.routes[0]).toEqual({ path: "/dashboard", component: "Dashboard" })
  })

  //#given a single ui:testid annotation
  test("parses single ui:testid annotation with key=value pairs", () => {
    //#given
    const text = `Feature: UI
  # @ui:testid data-testid=login-btn element=button
  Scenario: Login`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.ui.testIds).toHaveLength(1)
    expect(result.ui.testIds[0]).toEqual({ "data-testid": "login-btn", element: "button" })
  })

  //#given a single ui:string annotation
  test("parses single ui:string annotation with category.key=value", () => {
    //#given
    const text = `Feature: UI
  # @ui:string form.submitLabel=Save Changes
  Scenario: Form`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.ui.strings).toHaveLength(1)
    expect(result.ui.strings[0]).toEqual({ category: "form", key: "submitLabel", value: "Save Changes" })
  })

  //#given a single state:variable annotation
  test("parses single state:variable annotation", () => {
    //#given
    const text = `Feature: State
  # @state:variable counter number 0
  Scenario: Counter`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.state.variables).toHaveLength(1)
    expect(result.state.variables[0]).toEqual({ name: "counter", type: "number", default: "0" })
  })

  //#given a single state:initial annotation
  test("parses single state:initial annotation", () => {
    //#given
    const text = `Feature: State
  # @state:initial isLoggedIn=false
  Scenario: Auth`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.state.initial).toHaveLength(1)
    expect(result.state.initial[0]).toEqual({ key: "isLoggedIn", value: "false" })
  })

  //#given a single state:precondition annotation
  test("parses single state:precondition annotation", () => {
    //#given
    const text = `Feature: State
  # @state:precondition userExists=true
  Scenario: Login`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.state.preconditions).toHaveLength(1)
    expect(result.state.preconditions[0]).toEqual({ key: "userExists", value: "true" })
  })

  //#given a single assumption annotation
  test("parses single assumption annotation", () => {
    //#given
    const text = `Feature: App
  # @assumption: User has a valid email address
  Scenario: Registration`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.assumptions).toHaveLength(1)
    expect(result.assumptions[0]).toBe("User has a valid email address")
  })

  //#given multiple annotations of the same type
  test("aggregates multiple annotations of the same type", () => {
    //#given
    const text = `Feature: API
  # @api:endpoint GET /users
  # @api:endpoint POST /users
  # @api:endpoint DELETE /users/:id
  # @api:response 200 json
  # @api:response 404 json`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.api.endpoints).toHaveLength(3)
    expect(result.api.endpoints[0]).toEqual({ method: "GET", path: "/users" })
    expect(result.api.endpoints[1]).toEqual({ method: "POST", path: "/users" })
    expect(result.api.endpoints[2]).toEqual({ method: "DELETE", path: "/users/:id" })
    expect(result.api.responses).toHaveLength(2)
    expect(result.api.responses[0]).toEqual({ status: "200", format: "json" })
    expect(result.api.responses[1]).toEqual({ status: "404", format: "json" })
  })

  //#given text with no annotations
  test("returns empty object when no annotations found", () => {
    //#given
    const text = `Feature: Empty
  Scenario: Nothing here
    Given nothing`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.api.endpoints).toHaveLength(0)
    expect(result.api.responses).toHaveLength(0)
    expect(result.ui.routes).toHaveLength(0)
    expect(result.ui.testIds).toHaveLength(0)
    expect(result.ui.strings).toHaveLength(0)
    expect(result.state.variables).toHaveLength(0)
    expect(result.state.initial).toHaveLength(0)
    expect(result.state.preconditions).toHaveLength(0)
    expect(result.assumptions).toHaveLength(0)
  })

  //#given text with malformed annotations
  test("silently ignores malformed annotations without throwing", () => {
    //#given
    const text = `Feature: Broken
  # @api:endpoint
  # @api:response
  # @ui:route
  # @unknown:tag something
  # @assumption: valid assumption still works
  Scenario: Mixed`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.api.endpoints).toHaveLength(0)
    expect(result.api.responses).toHaveLength(0)
    expect(result.ui.routes).toHaveLength(0)
    expect(result.assumptions).toHaveLength(1)
    expect(result.assumptions[0]).toBe("valid assumption still works")
  })

  //#given text with annotations at various positions
  test("parses annotations mixed with regular Gherkin content", () => {
    //#given
    const text = `Feature: Mixed Content
  Background:
    Given a user

  # @api:endpoint GET /items
  # @state:initial count=0
  Scenario: View items
    Then I see items

  # @assumption: Items are sorted by date
  # @ui:string list.emptyLabel=No items found
  Scenario: Empty list
    Then I see nothing`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.api.endpoints).toHaveLength(1)
    expect(result.state.initial).toHaveLength(1)
    expect(result.assumptions).toHaveLength(1)
    expect(result.ui.strings).toHaveLength(1)
  })

  //#given a complex multi-annotation feature
  test("parses all annotation types in a single feature", () => {
    //#given
    const text = `Feature: Full annotations
  # @api:endpoint GET /api/v1/orders
  # @api:endpoint POST /api/v1/orders
  # @api:response 200 json
  # @api:response 401 json
  # @ui:route path=/orders component=OrderList
  # @ui:testid data-testid=order-table element=table
  # @ui:string order.emptyState=No orders yet
  # @state:variable totalOrders number 0
  # @state:variable isLoading boolean true
  # @state:initial filter=all
  # @state:precondition userAuthenticated=true
  # @assumption: Orders API responds within 200ms
  # @assumption: User has at least one order
  Scenario: Order management
    Given I am logged in
    When I view orders
    Then I see my orders`

    //#when
    const result = parseAnnotations(text)

    //#then
    expect(result.api.endpoints).toHaveLength(2)
    expect(result.api.responses).toHaveLength(2)
    expect(result.ui.routes).toHaveLength(1)
    expect(result.ui.testIds).toHaveLength(1)
    expect(result.ui.strings).toHaveLength(1)
    expect(result.state.variables).toHaveLength(2)
    expect(result.state.initial).toHaveLength(1)
    expect(result.state.preconditions).toHaveLength(1)
    expect(result.assumptions).toHaveLength(2)
  })
})

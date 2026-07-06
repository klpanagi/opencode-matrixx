# @assumption:api-version v2 or later
# @ui:string pagination.controlsLabel=Page Controls
# @state:variable currentPage number 1
@smoke
@regression
Feature: API Pagination
  As an API consumer
  I want to paginate through large result sets
  So that I can retrieve data in manageable chunks

  Rule: Standard cursor-based pagination
    # @state:variable cursorToken string ""
    Scenario: Fetch first page of results
      Given the API endpoint "/api/v2/items" is available
      When the client requests the first page with a limit of 20
      Then the response should contain 20 items
      And the response should include a "next_cursor" field
      But the "previous_cursor" field should be null

    # @ui:string pagination.nextButton=Next Page
    Scenario: Navigate to subsequent pages
      Given the client has a valid cursor token
      When the client requests the next page
      Then the response should contain 20 items
      And the response should include a "next_cursor" field
      But the results should not overlap with the previous page

  Rule: Filtering with pagination
    # @assumption:filter-syntax matches OpenAPI spec
    Scenario: Paginate filtered results
      Given the API endpoint "/api/v2/items" is available
      When the client requests items filtered by category "electronics"
      """
      {
        "filter": {
          "category": "electronics",
          "price_min": 100,
          "price_max": 500
        }
      }
      """
      Then the response should contain only "electronics" items
      And each item price should be between 100 and 500

    Scenario: Handle empty result sets gracefully
      Given the API endpoint "/api/v2/items" is available
      When the client requests items with a nonexistent category "quantum-computers"
      """
      {
        "filter": {
          "category": "quantum-computers"
        }
      }
      """
      Then the response should contain 0 items
      And the response should include a "next_cursor" field with value null
      But no error should be returned

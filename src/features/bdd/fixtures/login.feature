
Feature: User Login
  As a registered user
  I want to log in with my credentials
  So that I can access my account dashboard

  Scenario: Successful login with valid credentials
    Given the user is on the login page
    When the user enters "alice@example.com" as the email
    And the user enters "securePass123" as the password
    Then the user should be redirected to the dashboard
    And a welcome message should be displayed

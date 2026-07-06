@REQ-1619 @REQ-1620 @REQ-1621 @onboarding @tour
Feature: Welcome Tour Popup
  As a user who has just logged in for the first time
  I want to see a welcome tour
  So that I can quickly learn about the main features of the app

  Background:
    Given I have just completed first-time login setup
    And the Welcome Tour panel has slid up from the bottom of the screen
    And I am on step 1 of 3

  @happy-path
  Scenario: Tapping Next advances through tour steps
    When I tap 'Next' on step 1
    Then I advance to step 2
    And the pagination dot for step 2 becomes larger and darker
    When I tap 'Next' on step 2
    Then I advance to step 3
    And the 'Next' button now reads 'Get Started'

  @happy-path
  Scenario: Tapping Get Started on final step closes the tour
    Given I am on step 3 of the tour
    When I tap 'Get Started'
    Then the tour panel closes
    And I see the dashboard

  @happy-path
  Scenario: Tapping Skip Tour on step 1 or 2 closes the tour immediately
    Given I am on step 1 or step 2 of the tour
    When I tap 'Skip Tour'
    Then the tour panel closes immediately
    And I see the dashboard

  @happy-path
  Scenario: Tapping X button closes the tour
    When I tap the X button in the top-right corner
    Then the tour panel closes
    And I see the dashboard

  @happy-path
  Scenario: Tapping pagination dot jumps to that step
    When I tap the pagination dot for step 3
    Then I am immediately taken to step 3
    And the 'Next' button reads 'Get Started'

  @happy-path
  Scenario: Each tour step shows a title, description, and 4 feature highlights
    When I am on any step of the tour
    Then a title and description are shown for that step
    And 4 feature items are listed with green checkmark icons

  @edge-case
  Scenario: Skip Tour button is hidden on the final step
    Given I am on step 3 of the tour
    Then the 'Skip Tour' button is not shown
    And only 'Get Started' is shown at the bottom

  @edge-case
  Scenario: Content updates with each step
    When I navigate from step 1 to step 2
    Then the title and description change to match step 2 content
    And the feature list updates accordingly

  @unhappy-path
  Scenario: Tour panel cannot be dismissed if all dismiss actions fail
    Given the X button, Skip Tour, and backdrop are all unresponsive
    Then the user is stuck on the tour with no available fallback

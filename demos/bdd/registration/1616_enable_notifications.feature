@REQ-1616 @REQ-1617 @REQ-1618 @onboarding @notifications
Feature: Enable Notifications and All Set
  As a first-time user
  I want to be asked whether to enable notifications and see an All Set summary
  So that I can confirm my account is ready and go to the dashboard

  Background:
    Given I have completed the Enable Biometrics step
    And I am on the Enable Notifications screen

  @happy-path
  Scenario: Enabling notifications shows success and advances to All Set
    When I tap 'Enable Notifications'
    Then a success state shows a green checkmark and title 'Notifications Enabled!'
    And the description reads 'You will receive alerts for important account activities'
    And all action buttons are hidden during the success state
    And after approximately 2 seconds the app advances to the All Set screen

  @happy-path
  Scenario: Skipping notifications also advances to All Set
    When I tap 'Skip for Now'
    Then I advance to the All Set screen
    And notification preferences can be changed later in the app settings

  @happy-path
  Scenario: All Set screen shows summary of completed setup steps
    Given I am on the All Set screen
    Then the title reads 'All Set!'
    And four summary rows are shown: Transaction Alerts, Fast PIN, Biometric Login, Notifications
    And each row has an icon and a right-pointing arrow
    And a 'Go to Dashboard' button is shown at the bottom

  @happy-path
  Scenario: Go to Dashboard navigates to the main app
    Given I am on the All Set screen
    When I tap 'Go to Dashboard'
    Then I am navigated to the main app dashboard

  @unhappy-path
  Scenario: Auto-advance from Notifications Enabled screen fails
    Given the Notifications Enabled success state is shown
    When the automatic screen transition fails after approximately 2 seconds
    Then a 'Continue' button appears as fallback
    And tapping it advances to the All Set screen

  @unhappy-path
  Scenario: Dashboard navigation fails from All Set screen
    Given I am on the All Set screen
    When I tap 'Go to Dashboard' and navigation fails
    Then I remain on the All Set screen
    And no error state is shown but the button remains available to retry

  @edge-case
  Scenario: Four notification types are shown on Enable Notifications screen
    When I am on the Enable Notifications screen
    Then I see cards for Transaction Alerts, Security Alerts, Bill Reminders, and Balance Updates

  @edge-case
  Scenario: Summary rows on All Set are informational only — not tappable
    Given I am on the All Set screen
    When I tap any of the four summary rows
    Then nothing happens
    And the rows are for display purposes only

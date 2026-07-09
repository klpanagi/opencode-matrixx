@REQ-1614 @REQ-1615 @onboarding @biometrics
Feature: Enable Biometrics
  As a first-time user
  I want to be asked whether to enable biometric login
  So that I can use Face ID or fingerprint on future visits

  Background:
    Given I have completed the Create Fast PIN step
    And I am on the Enable Biometrics screen

  @happy-path
  Scenario: Enabling biometrics shows success and advances to Enable Notifications
    When I tap 'Enable Biometrics'
    Then a success state shows a green checkmark and title 'Biometrics Enabled!'
    And the description reads 'You can now login using Face ID or fingerprint'
    And all action buttons are hidden during the success state
    And after approximately 2 seconds the app advances to Enable Notifications

  @happy-path
  Scenario: Skipping biometrics also advances to Enable Notifications
    When I tap 'Skip for Now'
    Then I advance to the Enable Notifications screen
    And biometric login can be enabled later in the app settings

  @unhappy-path
  Scenario: Auto-advance from Biometrics Enabled screen fails
    Given the Biometrics Enabled success state is shown
    When the automatic screen transition fails after approximately 2 seconds
    Then a 'Continue' button appears as fallback
    And tapping it advances to Enable Notifications

  @edge-case
  Scenario: Two seconds window on confirmation screen cannot be skipped
    Given the Biometrics Enabled success state is shown
    Then no button is shown during this state
    And the auto-advance cannot be interrupted

@REQ-1607 @REQ-1608 @REQ-1609 @REQ-1610 @REQ-1611 @onboarding @first-login @SCA
Feature: First Time Login — Welcome, T&C, and Device Registration
  As a first-time user
  I want to enter my credentials, accept the Terms and Conditions, and register my device
  So that I can complete account setup and enable quick login methods

  Background:
    Given I tapped 'First time logging in?' on the login screen
    And I am on the First Time Login Welcome screen

  @happy-path
  Scenario: Both fields populated enables Continue button
    When I enter my username
    And I enter my password
    Then the 'Continue' button becomes active and turns blue

  @happy-path
  Scenario: Continue advances to Terms and Conditions screen
    Given both fields are populated with valid credentials
    When I tap 'Continue'
    Then I am taken to the Terms and Conditions screen
    And the title reads 'Terms & Conditions'
    And the subtitle reads 'Please review and accept to continue'
    And eight scrollable T&C sections are shown
    And an unticked checkbox is shown at the bottom

  @happy-path
  Scenario: Ticking checkbox enables I Accept button
    Given I am on the Terms and Conditions screen
    When I tick the checkbox 'I have read and agree to the Terms & Conditions and Privacy Policy'
    Then the 'I accept' button turns blue and becomes active

  @happy-path
  Scenario: Accepting T&C advances to Register Device screen
    Given I have ticked the T&C checkbox
    When I tap 'I accept'
    Then I am taken to the Register Device screen
    And the title reads 'Register Device'
    And an optional device name field is shown
    And 'Register This Device' and 'Skip for Now' buttons are shown

  @happy-path
  Scenario: Registering device with a name shows personalised success message
    Given I am on the Register Device screen
    When I enter a device name and tap 'Register This Device'
    Then a processing period of approximately 1.5 seconds occurs
    Then a success state shows a green checkmark and title 'Device Registered!'
    And the description uses my device name
    And all action buttons are hidden during the success state
    And after approximately 2 seconds the app automatically advances to Create Fast PIN

  @happy-path
  Scenario: Registering device without a name shows generic success message
    Given I am on the Register Device screen
    When I leave the device name empty and tap 'Register This Device'
    Then the success message reads 'This device has been added to your trusted devices'
    And the app automatically advances to Create Fast PIN after approximately 2 seconds

  @happy-path
  Scenario: Skipping device registration advances without registration
    Given I am on the Register Device screen
    When I tap 'Skip for Now'
    Then I advance to the Create Fast PIN screen
    And Fast PIN and biometrics will not be available until I register a device

  @unhappy-path
  Scenario: Empty fields keep Continue button inactive
    When either the username or password field is empty
    Then the 'Continue' button remains grey and inactive

  @unhappy-path
  Scenario: Incorrect credentials show error on Welcome screen
    Given both fields contain text
    When I tap 'Continue' with incorrect credentials
    Then an error message is shown
    And I remain on the Welcome screen

  @unhappy-path
  Scenario: T&C checkbox unticked — I Accept button inactive
    Given I am on the Terms and Conditions screen
    When I tap 'I accept' without ticking the checkbox
    Then I see: 'Please accept the terms to continue'
    And I am not advanced to the next step

  @unhappy-path
  Scenario: Device registration binding fails
    Given I am on the Register Device screen
    When the cryptographic device binding fails due to a network error
    Then I see: 'Device registration failed. Please try again.'
    And I can retry or tap 'Skip for Now' to continue without registering

  @unhappy-path
  Scenario: Auto-advance from Device Registered screen fails
    Given the Device Registered confirmation is shown
    When the automatic screen transition fails after approximately 2 seconds
    Then a 'Continue' button appears as a fallback
    And tapping it advances to Create Fast PIN

  @security @SCA
  Scenario: Device registration constitutes possession element of PSD2 SCA
    When device registration completes successfully
    Then the registered device constitutes the possession element of SCA under PSD2
    And the binding is cryptographically secured
    And only the authenticated user can register the device

  @edge-case
  Scenario: Unticking checkbox after ticking disables I Accept button again
    Given I have ticked the T&C checkbox
    When I un-tick the checkbox
    Then the 'I accept' button becomes grey and inactive again

  @edge-case
  Scenario: Password field always masked on First Time Login Welcome screen
    When I am on the First Time Login Welcome screen
    Then the password field is always masked
    And no show/hide toggle is available on this screen

  @edge-case
  Scenario: Username field has no pre-filled value
    When I arrive on the First Time Login Welcome screen
    Then the username field is completely blank
    And no placeholder suggestion is shown

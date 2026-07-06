@REQ-1591 @authentication @login @2FA
Feature: Welcome Screen — Existing Customer Routing
  As an existing customer
  I want to tap 'I already have an account' on the Welcome Screen
  So that I am taken to the appropriate login method based on my device setup

  Background:
    Given I have completed TIN verification and OTP authentication on the Welcome Screen
    And I am on the Welcome Screen with routing buttons active

  @happy-path
  Scenario: Navigate to Fast PIN login when PIN is set up
    Given I have previously set up a Fast PIN on this device
    When I tap 'I already have an account'
    Then I am taken to the Fast PIN entry screen immediately
    And no loading screen is shown during the transition

  @happy-path
  Scenario: Biometric option visible when biometrics are also enabled
    Given I have previously set up a Fast PIN on this device
    And biometric authentication is also enabled on this device
    When I tap 'I already have an account'
    Then I am taken to the Fast PIN entry screen by default
    And an option to switch to biometric login is visible on the screen

  @happy-path
  Scenario: Navigate to username and password when no quick login is set up
    Given I have not set up Fast PIN on this device
    And I have not set up biometric login on this device
    When I tap 'I already have an account'
    Then I am taken to the username and password login form
    And no loading screen is shown during the transition

  @security @2FA
  Scenario: Password-only login without registered device is rejected
    Given I am on the username and password login form
    And this device is not registered as a trusted device
    When I submit valid credentials
    Then the system rejects the authentication attempt
    And I am prompted to complete device registration before proceeding

  @security @2FA
  Scenario: Fast PIN plus registered device satisfies 2FA
    Given I have a registered device with Fast PIN enabled
    When I authenticate using my 6-digit Fast PIN
    Then the system accepts this as valid 2FA
    And I am navigated to the dashboard

  @security @2FA
  Scenario: Biometrics plus registered device satisfies 2FA
    Given I have a registered device with biometric login enabled
    When I authenticate using Face ID or fingerprint
    Then the system accepts this as valid 2FA
    And I am navigated to the dashboard

  @unhappy-path
  Scenario: Login screen fails to load after tapping button
    Given I tap 'I already have an account'
    When the login screen fails to load
    Then I remain on the Welcome Screen
    And an error message is shown
    And no partial navigation occurs

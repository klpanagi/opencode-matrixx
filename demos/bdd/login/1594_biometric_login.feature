@REQ-1594 @REQ-1595 @authentication @login @biometrics @security
Feature: Biometric Login
  As a user with biometrics enabled
  I want to authenticate using Face ID or fingerprint
  So that I can log in without entering my PIN or password

  Background:
    Given I am a registered user with biometrics enabled on this device
    And my device is registered and trusted
    And the device passes the integrity check at app launch

  @happy-path
  Scenario: Successful biometric authentication navigates to dashboard
    When I tap 'Continue' to initiate biometric scan
    Then a 'Scanning...' spinner is shown during authentication
    When the biometric scan succeeds
    Then 'Login successful!' confirmation is shown
    And I am navigated to the dashboard
    And the session timer starts from zero

  @happy-path
  Scenario: Payment and transfer available after clean integrity check
    Given I am logged in via biometric authentication
    And the device integrity check passes on app resume
    When I navigate to a payment or transfer flow
    Then the flow proceeds normally

  @unhappy-path
  Scenario: Biometric scan failure — switch to PIN
    When I tap 'Continue' to initiate biometric scan
    And the biometric scan fails
    Then an error banner is shown with a red warning icon
    And a 'Use PIN Instead' link appears below the error
    When I tap 'Use PIN Instead'
    Then I am taken to the 6-digit PIN entry screen
    And the error is cleared

  @unhappy-path @lockout
  Scenario: 3 consecutive biometric failures force password login
    Given I have failed biometric authentication 2 times
    When the biometric scan fails for the 3rd time
    Then I am forced to full password login
    And PIN fallback is not offered
    And I see: 'Please log in with your username and password.'

  @unhappy-path @device-integrity
  Scenario: Biometric login disabled on jailbroken or rooted device
    Given my device is detected as jailbroken or rooted
    When I open the login screen
    Then the biometric login option is not shown
    And I see: 'Biometric login is unavailable on this device.'
    And PIN or password login is offered as an alternative
    And I am not locked out of the app entirely

  @unhappy-path @device-integrity
  Scenario: New biometrics enrolled since last session blocks biometric login
    Given new biometric data was enrolled on my device since my last login
    When I attempt biometric authentication
    Then biometric login is blocked
    And I am redirected to full password login
    And I see an explanation that biometric re-enrollment is required

  @unhappy-path @device-integrity
  Scenario: Device integrity check failure on resume blocks transactions
    Given I am logged in with an active session
    When I resume the app from background
    And the device integrity check fails
    Then all payment and transfer flows are blocked for this session
    And I see the non-dismissible message: 'This device does not meet security requirements. Payment and transfer features are unavailable on this device. Please contact support.'
    And the event is logged server-side with timestamp and device fingerprint

  @unhappy-path @device-integrity
  Scenario: Integrity check failure mid-session at payment initiation
    Given I am logged in and my session is active
    When I initiate a payment or transfer
    And the device integrity check fails at that point
    Then the transaction is blocked immediately
    And the non-dismissible security message is shown
    And the event is logged server-side

  @edge-case
  Scenario: Switch back to biometric from PIN screen
    Given I previously tapped 'Use PIN Instead' after a biometric failure
    And I am on the PIN entry screen
    When I tap 'Use Biometric Login'
    Then I am returned to the biometric authentication screen

  @security
  Scenario: Compromised device cannot be registered as trusted
    Given my device has failed the integrity check
    When I attempt to register this device as a trusted device
    Then the registration is rejected
    And I see a message that the device cannot be trusted until the integrity issue is resolved

  @security
  Scenario: Device integrity check covers all required vectors
    When the device integrity check runs
    Then it evaluates jailbreak and root status
    And it evaluates whether the app is running on an emulator
    And it evaluates whether an active debugging session is present
    And it evaluates whether the app binary signature has been tampered with
    And the check is performed server-side in addition to client-side

  @security
  Scenario: Blocked device events logged server-side
    When a jailbreak root emulator or integrity failure is detected
    Then the event is logged server-side
    And the log includes a timestamp, device fingerprint, and the action that was attempted

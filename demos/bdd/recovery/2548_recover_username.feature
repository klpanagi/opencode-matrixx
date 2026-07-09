@REQ-2548 @REQ-2547 @REQ-2549 @authentication @recovery
Feature: Recover Username — Entry, OTP Verification, and Username Found
  As a user who has forgotten their username
  I want to enter my registered email and verify my identity via OTP
  So that I can retrieve my username and return to login

  Background:
    Given I tapped 'Forgot my username' on the recovery choice screen
    And I am on the Recover Your Username screen

  @happy-path
  Scenario: Valid email triggers OTP and advances to verification
    When I enter a valid email address
    And I tap 'Send verification code'
    Then a verification code is sent to the entered email
    And I am advanced to the OTP entry screen
    And the screen title shows the email address the code was sent to

  @happy-path
  Scenario: Correct OTP reveals username
    Given I am on the OTP entry screen for username recovery
    When I enter the correct 6-digit code
    And I tap 'Verify'
    Then I am taken to the Username Found screen
    And a green confirmation icon is shown
    And the title reads 'Username found!'
    And my recovered username is displayed prominently in a highlighted card
    And a 'Back to Login' button is shown

  @happy-path
  Scenario: Back to Login navigates to login screen
    Given I am on the Username Found screen
    When I tap 'Back to Login'
    Then I am taken to the login screen

  @happy-path
  Scenario: Username displayed exactly as stored — no masking
    Given I am on the Username Found screen
    Then my username is displayed exactly as stored on the account
    And no masking or truncation is applied

  @unhappy-path
  Scenario: Empty email field keeps button inactive
    When I leave the email field empty
    Then the 'Send verification code' button is inactive

  @unhappy-path
  Scenario: Invalid email format keeps button inactive
    When I enter an email without an @ symbol
    Then the 'Send verification code' button remains inactive

  @unhappy-path
  Scenario: Email not associated with any account shows error
    When I enter an email address not linked to any account
    And I tap 'Send verification code'
    Then an appropriate error message is shown on this screen
    And I am not advanced to the OTP screen

  @unhappy-path
  Scenario: Incorrect OTP shows error
    Given I am on the OTP entry screen for username recovery
    When I enter an incorrect code and tap 'Verify'
    Then I see an error message below the boxes
    And the boxes are not cleared automatically

  @unhappy-path @lockout
  Scenario: OTP flow locked after 3 failed attempts
    Given I have already failed OTP verification 2 times
    When I enter an incorrect code for the 3rd time
    Then the recovery flow is locked for 30 minutes
    And I see: 'Too many failed attempts. Please wait 30 minutes.'

  @unhappy-path
  Scenario: Username cannot be retrieved after successful OTP
    Given I have verified my identity via OTP
    When the username retrieval fails on the server
    Then an error message is shown instead of the username card
    And guidance to contact support is provided

  @security
  Scenario: OTP for username recovery uses CSPRNG and expires after 5 minutes
    When a username recovery OTP is requested
    Then it is generated server-side using a CSPRNG
    And it expires after 5 minutes
    And a countdown timer is displayed

  @security
  Scenario: OTP is single-use and invalidated after first attempt
    When I submit any OTP for username recovery
    Then that OTP is immediately invalidated regardless of outcome

  @edge-case
  Scenario: Back button from OTP screen returns to email entry with no side effects
    Given I am on the OTP entry screen for username recovery
    When I tap the back button
    Then I am returned to the email entry screen
    And the selected recovery method is cleared

  @edge-case
  Scenario: Username found screen does not auto-dismiss
    Given I am on the Username Found screen
    When I remain on the screen without tapping anything
    Then the screen stays open indefinitely
    And I must tap 'Back to Login' to proceed

  @edge-case
  Scenario: Resend clears all OTP boxes and sends new code to same email
    Given I am on the OTP entry screen for username recovery
    When I tap 'Resend'
    Then all boxes are cleared
    And a new code is sent to the same email address

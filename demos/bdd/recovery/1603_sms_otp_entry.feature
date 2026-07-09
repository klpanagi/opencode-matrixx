@REQ-1603 @authentication @password-reset @otp
Feature: Send via SMS — Enter OTP Verification Code
  As a user who requested a verification code by SMS
  I want to enter the 6-digit code
  So that I can verify my identity and proceed to create a new password

  Background:
    Given I selected 'Send via SMS' on the method selection screen
    And a 6-digit OTP has been sent to my registered masked phone number
    And I am on the OTP entry screen showing six digit input boxes

  @happy-path
  Scenario: Correct OTP advances to password creation screen
    When I enter the correct 6-digit OTP
    And I tap 'Verify'
    Then I am advanced to the Create New Password screen

  @happy-path
  Scenario: Native SMS auto-population fills the OTP boxes
    When the incoming SMS is detected by the device
    Then the OTP is automatically populated into the six digit boxes
    And I can tap 'Verify' without manual entry

  @unhappy-path
  Scenario: Incorrect OTP shows error and retains entered digits
    When I enter an incorrect 6-digit OTP
    And I tap 'Verify'
    Then I see: 'Invalid verification code. Please try again.'
    And the digit boxes are not cleared automatically
    And I can correct individual digits without re-entering all six

  @unhappy-path @security
  Scenario: Reused OTP is rejected
    Given the OTP has already been submitted once
    When I attempt to use the same OTP code again
    Then I see: 'Invalid verification code. Please try again.'
    And the submission is rejected regardless of whether the first attempt succeeded

  @unhappy-path @lockout
  Scenario: Flow locked after 3 incorrect OTP attempts
    Given I have already made 2 incorrect OTP attempts
    When I enter an incorrect OTP for the 3rd time
    Then the verification flow is locked for 30 minutes
    And I see: 'Too many failed attempts. Please wait 30 minutes before trying again.'

  @unhappy-path
  Scenario: OTP expires before entry
    Given the 5-minute OTP validity window has elapsed
    When I attempt to enter the OTP
    Then all digit boxes are cleared
    And the 'Verify' button is disabled
    And an expiry message prompts me to request a new code

  @edge-case
  Scenario: Resend link disabled for 60 seconds after each use
    When I tap 'Resend'
    Then a new OTP is sent to my registered phone
    And the 'Resend' link is disabled
    And a countdown shows 'Resend available in Xs'
    And the link re-enables after 60 seconds

  @edge-case
  Scenario: Resend permanently disabled after 3 uses
    Given I have already resent the OTP 3 times
    When I attempt to tap 'Resend' again
    Then the 'Resend' link is permanently disabled for this session
    And I must restart the forgot password flow to receive a new code

  @edge-case
  Scenario: Pasting a 6-digit code fills all boxes at once
    When I paste a 6-digit numeric code
    Then all six boxes are filled simultaneously
    And focus moves to the last box

  @security
  Scenario: OTP countdown timer visible from screen load
    When I arrive on the OTP entry screen
    Then a countdown timer is visible showing the remaining validity time
    And the timer starts at 5 minutes and counts down

  @security
  Scenario: Verify button inactive until all 6 digits entered
    Given I have entered only 5 digits
    Then the 'Verify' button is greyed out and cannot be tapped

  # Validation Rules (enforced server-side):
  @security
  Scenario: OTP generated server-side using CSPRNG
    When a new OTP is requested
    Then the OTP is generated server-side using a cryptographically secure random number generator
    And the OTP value is never returned in or derivable from any API response
    And the OTP expires after exactly 5 minutes from generation time

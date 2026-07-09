@REQ-1599 @REQ-1602 @authentication @password-reset @otp
Feature: Enter OTP Verification Code — Email and SMS Paths
  As a user who requested a verification code
  I want to enter the 6-digit code
  So that I can verify my identity and proceed to create a new password

  Background:
    Given I have selected a verification channel and a code has been sent
    And I am on the OTP entry screen showing six individual digit boxes
    And the OTP countdown timer is running from 5 minutes

  @happy-path
  Scenario Outline: Correct OTP advances to password creation screen
    Given I received my OTP via <channel>
    When I enter the correct 6-digit OTP
    And I tap 'Verify'
    Then I am advanced to the Create New Password screen

    Examples:
      | channel   |
      | SMS       |

  @happy-path
  Scenario: Native SMS auto-population fills the OTP boxes
    When the incoming SMS is detected by the device
    Then the OTP is automatically populated into the six digit boxes
    And I can tap 'Verify' without manual entry

  @happy-path
  Scenario: Pressing Enter triggers verification when all boxes are filled
    When I fill all 6 boxes and press Enter
    Then verification is triggered immediately

  @unhappy-path
  Scenario: Incorrect OTP shows error and retains entered digits
    When I enter an incorrect 6-digit OTP and tap 'Verify'
    Then I see: 'Invalid verification code. Please try again.'
    And the digit boxes are not cleared automatically
    And I can correct individual digits

  @unhappy-path @security
  Scenario: Reused OTP is always rejected
    Given the OTP has already been submitted once
    When I attempt to submit the same OTP code again
    Then I see: 'Invalid verification code. Please try again.'

  @unhappy-path @lockout
  Scenario: Flow locked after 3 incorrect OTP attempts
    Given I have already made 2 incorrect OTP attempts
    When I enter an incorrect OTP for the 3rd time
    Then the verification flow is locked for 30 minutes
    And I see: 'Too many failed attempts. Please wait 30 minutes or request a new code.'

  @unhappy-path
  Scenario: OTP expires — countdown reaches zero
    Given the 5-minute OTP validity window elapses
    Then all digit boxes are cleared
    And the 'Verify' button is disabled
    And a message prompts me to request a new code

  @edge-case
  Scenario: Resend link has 60-second cooldown after use
    When I tap 'Resend'
    Then a new OTP is sent to my registered contact
    And the 'Resend' link is disabled
    And a countdown shows 'Resend available in Xs'
    And the link re-enables after 60 seconds

  @edge-case
  Scenario: Resend permanently disabled after 3 requests
    Given I have already resent the OTP 3 times in this session
    When I attempt to tap 'Resend' again
    Then the 'Resend' link is permanently disabled for this session

  @edge-case
  Scenario: Pasting a 6-digit code fills all boxes at once
    When I paste a 6-digit numeric code
    Then all six boxes fill simultaneously

  @security
  Scenario: OTP generated server-side using CSPRNG
    When any OTP is requested in this flow
    Then it is generated server-side using a cryptographically secure random number generator
    And the OTP value is never returned in or derivable from any API response

  @security
  Scenario: OTP is single-use and invalidated after first attempt
    When I submit any OTP regardless of whether it is correct
    Then that OTP is immediately invalidated
    And cannot be submitted again

@REQ-1590 @authentication @onboarding @CBS @SCA
Feature: Welcome Screen — TIN Verification and Routing
  As a new or returning user
  I want to see a clear welcome screen when I open the app
  So that I can verify my identity and be routed to the correct flow

  Background:
    Given I have just launched the app
    And the Welcome Screen is displayed with title 'Welcome to The Bank'
    And both routing buttons are initially inactive

  @happy-path
  Scenario: Existing customer routed to login after TIN match and OTP
    Given I select my country
    When I enter a valid TIN that matches an active account in CBS
    And the CBS returns a match
    And an OTP is sent to my registered phone via SMS
    And I enter the correct OTP
    Then both routing buttons become active
    And tapping 'I already have an account' takes me to the login screen
    And the TIN field shows only the last 4 digits

  @happy-path
  Scenario: New customer routed to registration when no CBS match
    Given I select my country
    When I enter a valid TIN that has no match in CBS
    Then tapping 'I'm new to The Bank' takes me to the Registration flow
    And no OTP is triggered

  @unhappy-path @account-status
  Scenario Outline: Blocked or suspended account prevents all routing
    Given I enter a valid TIN matching a <status> account in CBS
    When the CBS returns account status <status>
    Then neither routing button becomes active
    And I see a support contact message
    And no OTP is sent

    Examples:
      | status    |
      | BLOCKED   |
      | SUSPENDED |

  @unhappy-path @account-status
  Scenario: Account under review blocks registration only
    Given I enter a valid TIN matching an account under review
    When the CBS returns status UNDER REVIEW
    Then the registration button is disabled
    And login is restricted pending review
    And an informational message is shown

  @unhappy-path @validation
  Scenario Outline: Invalid TIN format rejected before CBS query
    Given I have selected country <country>
    When I enter a TIN <tin> that does not match the expected format
    Then I see an inline format error
    And the CBS query is not triggered

    Examples:
      | country | tin       |
      | Greece  | 12345     |
      | Germany | 123456789 |
      | Spain   | 12345678  |

  @unhappy-path @rate-limiting
  Scenario: User exceeds 5 TIN lookup attempts in one session
    Given I have already made 4 failed TIN lookup attempts
    When I enter a TIN and trigger a 5th failed lookup
    Then further TIN lookup attempts are blocked for this session
    And I see: 'Too many failed attempts. Please contact the Support Centre.'
    And no automatic reset occurs

  @unhappy-path @infrastructure
  Scenario: CBS service unavailable
    Given the CBS service is unavailable
    When I enter a valid TIN and trigger the lookup
    Then I see: 'We are unable to verify your identity at the moment. Please try again.'
    And both routing buttons remain inactive

  @unhappy-path @otp
  Scenario: OTP not received — resend available after 60 seconds
    Given I have entered a valid TIN with a CBS match
    And an OTP was sent via SMS
    When 60 seconds pass without me receiving the OTP
    Then I can tap 'Resend' to request a new code

  @security
  Scenario: TIN validation performed server-side only
    When I enter any TIN value
    Then the format check is performed server-side
    And no TIN validation logic runs client-side
    And the TIN is masked showing only the last 4 digits after entry

  @edge-case
  Scenario: App assets fail to load — buttons remain functional
    Given the branded illustration fails to load
    Then both routing buttons remain visible and functional
    And the Welcome Screen remains usable

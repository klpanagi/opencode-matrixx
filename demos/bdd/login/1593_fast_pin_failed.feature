@REQ-1593 @security @authentication @login
Feature: Fast PIN Login Failed
  As a user who enters an incorrect Fast PIN
  I want to see a clear error message with remaining attempts
  So that I know my progress toward lockout and can take corrective action

  Background:
    Given I am a registered user with Fast PIN enabled
    And my device is registered and trusted
    And my account is in Normal status
    And I am on the Fast PIN entry screen

  @happy-path
  Scenario: Successful PIN login on first attempt
    When I enter my correct 6-digit PIN
    Then I am navigated to the dashboard
    And the failed attempt counter is reset to 0

  @unhappy-path
  Scenario Outline: Failed PIN login with remaining attempts
    Given I have previously failed PIN login <previous_failures> times
    When I enter an incorrect 6-digit PIN
    Then I see the error "Incorrect PIN. <remaining> attempt(s) remaining."
    And the PIN boxes are cleared
    And I must wait <delay> seconds before my next attempt
    And the countdown timer is displayed on screen

    Examples:
      | previous_failures | remaining | delay |
      | 0                 | 2         | 30    |
      | 1                 | 1         | 60    |

  @unhappy-path @lockout
  Scenario: Account locked after 3 consecutive failed PIN attempts
    Given I have previously failed PIN login 2 times
    When I enter an incorrect 6-digit PIN for the 3rd time
    Then I see the message "Too many failed attempts. Please use password login or contact support."
    And PIN entry is disabled
    And my account is locked for 15 minutes
    And a security alert is sent to my registered email and phone
    And the lockout is enforced server-side

  @unhappy-path @lockout
  Scenario: Lockout persists after app restart
    Given my account is locked due to 3 failed PIN attempts
    When I close and reopen the app
    Then the lockout is still active
    And the remaining lockout time is displayed

  @unhappy-path @lockout
  Scenario: Lockout applies to all login methods
    Given my account is locked due to 3 failed PIN attempts
    When I attempt to switch to biometric login
    Then biometric login is also blocked
    And I see the message "Your account is temporarily locked."

  @unhappy-path
  Scenario: Progressive delay timer visible during cooldown
    Given I have failed PIN login 1 time
    When I try to enter a PIN before the 30-second cooldown expires
    Then the PIN entry is blocked
    And a countdown timer shows remaining wait time

  @edge-case
  Scenario: Switching to password login after PIN failure uses separate counter
    Given I have failed PIN login 2 times
    When I tap "Login with Username and Password"
    Then I am taken to the password login screen
    And the password attempt counter is independent of the PIN counter

  @security
  Scenario: Security alert delivered even if notification fails
    Given I have failed PIN login 2 times
    When I enter an incorrect PIN for the 3rd time
    And the push notification fails to deliver
    Then the account lockout is still enforced
    And the user can contact support via the "I don't have access" link

@REQ-1600 @REQ-1604 @authentication @password-reset
Feature: Create New Password
  As a user who has verified their identity via OTP
  I want to create a new password that meets the bank's security requirements
  So that I can regain secure access to my account

  Background:
    Given I have successfully verified my identity via OTP
    And I am on the Create New Password screen
    And the reset token is valid and has not been used

  @happy-path
  Scenario Outline: Successfully reset password via different verification channels
    Given I arrived at this screen via the <channel> verification path
    When I enter a valid password meeting all 5 complexity rules
    And I enter the same password in the confirm field
    And I tap 'Reset password'
    Then my password is updated successfully
    And the reset token is immediately invalidated
    And I am shown the 'Password changed successfully!' confirmation screen

    Examples:
      | channel   |
      | Email OTP |
      | SMS OTP   |

  @unhappy-path
  Scenario Outline: Password rejected for failing a complexity rule
    When I enter a password that fails the <rule> requirement
    Then the <rule> indicator shows an empty circle
    And the 'Reset password' button remains disabled

    Examples:
      | rule                      |
      | at least 8 characters     |
      | uppercase letter          |
      | lowercase letter          |
      | number                    |
      | special character         |

  @unhappy-path
  Scenario: Passwords do not match
    When I enter a valid password in the password field
    And I enter a different value in the confirm password field
    And I tap 'Reset password'
    Then I see the inline error 'Passwords do not match'
    And my password is not changed

  @unhappy-path @security
  Scenario: Password found in breach database is rejected
    When I enter a password that satisfies all 5 complexity rules
    And the password appears in the known breach database
    Then I see: 'This password has appeared in a data breach. Please choose a different one.'
    And the 'Reset password' button remains disabled
    And submission is blocked even though the checklist shows all rules as met

  @unhappy-path @security
  Scenario: Password matching a recently used password is rejected
    When I enter a password that matches one of my last 5 used passwords
    And all 5 complexity rules are satisfied
    Then I see: 'This password was used recently. Please choose a new one.'
    And my password is not changed

  @unhappy-path @security
  Scenario: Password containing username is rejected with generic message
    When I enter a password that incorporates my username
    And all 5 complexity rules are satisfied
    Then I see: 'This password configuration is not permitted. Please choose a different one.'
    And the exact nature of the rejection is not disclosed to the user
    And my password is not changed

  @unhappy-path @security
  Scenario: Expired reset token prevents password change
    Given 16 minutes have passed since the reset token was issued
    When I attempt to submit a new password
    Then I see: 'This reset link has expired. Please request a new one.'
    And my password is not changed

  @unhappy-path @security
  Scenario: Already-used reset token is rejected
    Given the reset token has already been used once
    When I attempt to submit a new password
    Then I see: 'This reset link has already been used.'
    And my password is not changed

  @edge-case
  Scenario: Real-time checklist updates as user types
    When I type characters progressively into the password field
    Then each complexity rule indicator updates in real time
    And green ticks appear as each rule is satisfied
    And empty circles return if a rule becomes unsatisfied again

  @edge-case
  Scenario: Maximum password length enforced silently at 128 characters
    When I enter a password of exactly 129 characters
    Then the field does not accept the 129th character
    And no error message is shown for this constraint

  @edge-case
  Scenario: Breach check blocks submission even when all 5 rules pass
    When I enter a breached password that satisfies all 5 complexity rules
    Then the requirement checklist shows all rules as met
    But the breach check error still blocks submission

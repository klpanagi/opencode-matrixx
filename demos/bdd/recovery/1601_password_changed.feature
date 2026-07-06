@REQ-1601 @REQ-1605 @authentication @password-reset
Feature: Password Changed Successfully
  As a user who has successfully reset their password
  I want to see a confirmation screen
  So that I know my password has been updated and I can return to login

  Background:
    Given I have just successfully reset my password
    And I am on the Password Changed Successfully screen

  @happy-path
  Scenario Outline: Confirmation shown identically for both verification channels
    Given I reset my password via the <channel> verification path
    Then a green circle with a checkmark icon is shown centred on the screen
    And the title reads 'Password changed successfully!'
    And the subtitle reads 'You can now sign in with your new password.'
    And a single 'Login' button is shown at the bottom in solid blue full width
    And no back button is displayed

    Examples:
      | channel   |
      | Email OTP |
      | SMS OTP   |

  @happy-path
  Scenario: Tapping Login returns to the login screen
    When I tap 'Login'
    Then I am navigated to the login screen

  @edge-case
  Scenario: Screen does not auto-dismiss — user must tap Login
    When I remain on the confirmation screen without tapping anything
    Then the screen stays open
    And no automatic navigation occurs

  @unhappy-path
  Scenario: Navigation to login fails after tapping Login
    When I tap 'Login'
    And the navigation to the login screen fails
    Then an error message is shown
    And the 'Login' button returns to its active state
    And I can retry by tapping 'Login' again

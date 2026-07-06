@REQ-1592 @authentication @login @SCA @PIN
Feature: Fast PIN Login — Successful Login
  As a returning user with Fast PIN enabled
  I want to enter my 6-digit Fast PIN
  So that I can log in quickly without typing my full password

  Background:
    Given I am a returning user with Fast PIN enabled on this device
    And my device is registered and trusted
    And I am on the Fast PIN entry screen showing 6 individual digit boxes

  @happy-path
  Scenario: Successful PIN entry navigates to dashboard
    When I enter my correct 6-digit PIN
    Then a brief 'Login successful!' message is shown
    And I am navigated to the dashboard

  @happy-path
  Scenario: Continue button activates only when all 6 digits are entered
    When I enter all 6 digits of my PIN
    Then the 'Continue' button becomes active
    And I can tap it to submit

  @happy-path
  Scenario: Focus moves to next box automatically on digit entry
    When I enter a digit in any PIN box
    Then focus automatically moves to the next box

  @happy-path
  Scenario: Pasting a 6-digit code fills all boxes at once
    When I paste a 6-digit numeric code
    Then all six boxes are filled simultaneously
    And focus moves to the last box

  @unhappy-path
  Scenario: Incorrect PIN shows error — see Fast PIN Failed story
    When I enter an incorrect PIN
    Then refer to REQ-1593 Fast PIN Login Failed for error handling behaviour

  @security
  Scenario: Blocked PIN pattern is rejected
    When I enter a PIN matching a blocked pattern
    Then I see: 'This PIN is too simple or was recently used.'
    And the PIN boxes are cleared

  @security
  Scenario Outline: Specific blocked PIN patterns are rejected
    When I enter the PIN <pin>
    Then PIN entry is rejected as a blocked pattern

    Examples:
      | pin    |
      | 123456 |
      | 654321 |
      | 111111 |
      | 000000 |

  @security @SCA
  Scenario: Fast PIN satisfies PSD2 SCA as knowledge element
    Given I have authenticated using my 6-digit Fast PIN on this registered device
    Then the knowledge element of PSD2 SCA is satisfied by the Fast PIN
    And the possession element is satisfied by the registered device
    And two-factor authentication is complete

  @edge-case
  Scenario: Backspace on empty box moves focus to previous box
    Given I have entered 3 digits
    When I press Backspace on the 4th empty box
    Then focus moves back to the 3rd box

  @edge-case
  Scenario: Continue button remains greyed out until all 6 digits entered
    Given I have entered only 5 digits
    Then the 'Continue' button is greyed out and cannot be tapped

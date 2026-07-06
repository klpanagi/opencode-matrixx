@REQ-1612 @REQ-1613 @onboarding @PIN @security @SCA
Feature: Create Fast PIN
  As a first-time user
  I want to set up a 6-digit Fast PIN
  So that I can log in more quickly on future visits

  Background:
    Given I have completed device registration
    And I am on the Create Fast PIN screen
    And two masked 6-digit input fields are shown

  @happy-path
  Scenario: Valid PIN accepted and success confirmation shown
    When I enter a valid 6-digit PIN in both fields
    And both fields match
    And I tap 'Create PIN'
    Then a success state shows a green checkmark and title 'PIN Created!'
    And the description reads 'You can now use your Fast PIN to login quickly'
    And all action buttons are hidden during the success state
    And after approximately 2 seconds the app advances to Enable Biometrics

  @happy-path
  Scenario: Skipping PIN creation advances without setting up PIN
    When I tap 'Skip for Now'
    Then I advance to the Enable Biometrics screen
    And Fast PIN login is not available until a PIN is set up

  @unhappy-path
  Scenario: PIN shorter than 6 digits rejected
    When I enter fewer than 6 digits in the PIN field
    And I tap 'Create PIN'
    Then I see: 'PIN must be 6 digits'

  @unhappy-path
  Scenario: Mismatched PINs rejected
    When I enter different values in the two PIN fields
    And I tap 'Create PIN'
    Then I see: 'PINs do not match'

  @unhappy-path @security
  Scenario Outline: Weak PIN patterns are rejected
    When I enter the PIN <pin> in both fields
    And I tap 'Create PIN'
    Then I see: 'This PIN is too weak. Please choose a different one.'

    Examples:
      | pin    |
      | 123456 |
      | 654321 |
      | 111111 |
      | 000000 |
      | 246810 |
      | 135790 |
      | 112233 |
      | 121212 |

  @unhappy-path @security
  Scenario: Fast PIN matching Transaction PIN is rejected
    When I enter a Fast PIN that matches my Transaction PIN
    And I tap 'Create PIN'
    Then I see: 'Your Fast PIN cannot match your Transaction PIN. Please choose a different one.'

  @unhappy-path
  Scenario: Auto-clear after 3 consecutive validation failures
    Given I have failed PIN validation 2 times
    When I enter an invalid PIN for the 3rd consecutive time
    Then both PIN fields are automatically cleared
    And focus returns to the first field

  @unhappy-path
  Scenario: Auto-advance from PIN Created screen fails
    Given the PIN Created success state is shown
    When the automatic screen transition fails after approximately 2 seconds
    Then a 'Continue' button appears as fallback
    And tapping it advances to Enable Biometrics

  @security
  Scenario: PIN stored as salted cryptographic hash — never in plaintext
    When I successfully create a Fast PIN
    Then the PIN is transmitted exclusively over TLS
    And it is stored server-side as a salted cryptographic hash
    And no plaintext version is stored anywhere on the device or server

  @security @SCA
  Scenario: Fast PIN constitutes knowledge element of PSD2 SCA setup
    When I successfully create a Fast PIN on this registered device
    Then the Fast PIN constitutes the knowledge element of PSD2 SCA
    And the registered device constitutes the possession element
    And two-factor authentication setup is complete

  @edge-case
  Scenario: Non-numeric characters stripped automatically from PIN fields
    When I attempt to enter non-numeric characters in either PIN field
    Then they are stripped automatically
    And only digits are accepted

  @edge-case
  Scenario: Changing either field clears the error message
    Given a validation error is shown
    When I change the value in either PIN field
    Then the error message is cleared immediately

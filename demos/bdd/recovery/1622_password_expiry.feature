@REQ-1622 @REQ-1623 @REQ-1624 @security @password @expiry
Feature: Password Expiring Soon Popup
  As a user whose password is about to expire
  I want to see a notification popup
  So that I know I need to update my password and can take action

  Background:
    Given I have logged in successfully
    And my password expiry date is approaching or has passed

  @happy-path
  Scenario: Expiry popup appears starting 14 days before expiry
    Given my password expires in 14 days or fewer
    When I log in
    Then a bottom panel slides up showing an orange warning icon
    And the title reads 'Password Expiring Soon'
    And the subtitle reads 'Your password security needs attention'
    And an orange card shows 'N Days Until expiration'
    And a 'Change password' button is shown
    And a 'Skip for Now' button is shown when more than 3 days remain

  @happy-path
  Scenario: Skip for Now dismisses the popup when more than 3 days remain
    Given my password expires in more than 3 days
    When I tap 'Skip for Now'
    Then the popup is dismissed
    And I continue to the app normally
    And the popup will reappear on my next login

  @happy-path
  Scenario: Change password button opens the password change flow
    When I tap 'Change password'
    Then the popup closes
    And the password change flow is opened

  @happy-path
  Scenario: X button dismisses the popup when more than 3 days remain
    Given my password expires in more than 3 days
    When I tap the X button
    Then the popup is dismissed
    And I continue to the app normally

  @happy-path
  Scenario: Tapping backdrop dismisses the popup when more than 3 days remain
    Given my password expires in more than 3 days
    When I tap the dark backdrop outside the popup
    Then the popup is dismissed

  @happy-path
  Scenario: Day count shows singular form when 1 day remains
    Given my password expires in exactly 1 day
    When the popup is shown
    Then the orange card reads '1 Day Until expiration'

  @unhappy-path @security
  Scenario: Skip for Now hidden when 3 or fewer days remain
    Given my password expires in 3 days or fewer
    When the popup is shown
    Then the 'Skip for Now' button is not shown
    And only 'Change password' is available
    And the user must change their password to proceed

  @unhappy-path @security
  Scenario: All app access blocked when password has expired
    Given my password has expired
    When I log in
    Then I am shown a mandatory password change screen with no dismiss option
    And I see: 'Your password has expired. You must create a new password to continue.'
    And no app functionality is accessible until the password is changed

  @unhappy-path @security
  Scenario: Warning frequency escalates to every login within 7 days
    Given my password expires in 7 days or fewer
    When I log in
    Then the expiry popup is shown on every login regardless of prior dismissal

  @unhappy-path
  Scenario: Password change flow fails to open from popup
    When I tap 'Change password' and the flow fails to open
    Then I remain on the popup
    And I see: 'Unable to open the password change screen. Please try again.'

  @security
  Scenario: All password expiry and change events recorded in audit trail
    When any password expiry popup event occurs
    And when a password is changed from this popup
    Then the event is recorded in the audit trail with timestamp and user identifier

  @edge-case
  Scenario: Popup reappears on next login if not acted upon
    Given I dismissed the popup without changing my password
    When I log in again
    Then the popup appears again if the expiry threshold is still active

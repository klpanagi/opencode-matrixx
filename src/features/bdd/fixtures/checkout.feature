# @state:shopping-cart initialized
# @ui:route /checkout
# @api:response checkout-response-v2
Feature: Checkout Process
  As a customer with items in my cart
  I want to complete the checkout flow
  So that I can purchase my selected products

  Background:
    Given the user has items in the shopping cart
    And the user is authenticated

  # @ui:route /checkout/shipping
  Scenario Outline: Select shipping method
    Given the user is on the shipping step
    When the user selects "<method>" as the shipping option
    Then the shipping cost should be "<cost>"
    And the order total should be updated

    Examples:
      | method      | cost  |
      | standard    | $5.99 |
      | express     | $12.99 |
      | overnight   | $24.99 |

  # @api:response payment-gateway-response
  Scenario: Apply discount code during checkout
    Given the user is on the payment step
    When the user applies discount code "SAVE20"
    Then the following adjustments should be applied:

      | Item          | Original Price | Discount | Final Price |
      | Widget A      | $49.99         | 20%      | $39.99      |
      | Gadget B      | $29.99         | 20%      | $23.99      |
      | Shipping      | $5.99          | 0%       | $5.99       |

    And the order total should reflect the discount

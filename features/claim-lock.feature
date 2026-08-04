Feature: Local atomic claim lock for Linear operation agents

  The plugin owns planning and state changes through a connected Linear OAuth app.
  Its packaged SQLite lease prevents agents sharing one consumer workspace from
  claiming the same issue or exact resource at the same time.

  Scenario: Competing agents claim the same issue
    Given one agent holds an unexpired claim for a Linear issue
    When another agent tries to claim that issue
    Then the second claim is rejected without changing Linear

  Scenario: Competing agents claim the same resource
    Given one agent holds an unexpired claim for an exact resource key
    When another agent claims a different issue using that resource key
    Then the second claim is rejected

  Scenario: An expired agent is fenced
    Given an agent claim has expired
    When another agent claims the issue
    Then the new claim succeeds with a different token
    And the expired claim is available for Linear reconciliation

  Scenario: A running agent maintains and releases its lease
    Given an agent holds a valid claim
    When it heartbeats and later releases the claim
    Then its lease is extended before release
    And the issue and resources become claimable again

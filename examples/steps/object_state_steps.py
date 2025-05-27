# Testfile

from pytest_bdd import when, parse

@when(parse("the Object state is {state}"))
def the_object_state_is(state):
    return {"state": state}

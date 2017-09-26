from typing import List
from pypred import Predicate
from satispy import Variable, Cnf
from satispy.solver import Minisat
import yaml

def x():
    with open("tst_comm/AWS_spot.yml", 'r') as stream:
        data = yaml.load(stream)

def resolve(exprs):
    pass
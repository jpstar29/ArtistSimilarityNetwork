import networkx as nx
import os
from ast import literal_eval

# 1. Load the GEXF file

if not os.path.exists(r"Backend_Code\GEXF_Files"):
    os.makedirs(r"Backend_Code\GEXF_Files") #GEXF_Files may not be a created folder. So we have to create it. This is included in the gitignore.
    raise RuntimeError("Please create a GEXF file and put it in the folder Backend_Code\GEXF_Files (created for you now) - GEXF files can be automatically created in createNetwork.py if it has a dataset")
filePath = r"Backend_Code\GEXF_Files\artistsColoured.gexf"

G = nx.read_gexf(filePath)

for communitySelected in range(41): #41 communities, from 0 to 40.

    folderPath =  r"Backend_Code\FrequencyGraphs\TagFrequencyMap\Community %s" %(communitySelected)

    if not os.path.exists(folderPath):
        os.makedirs(folderPath) #We are creating a folder for each community, so we don't want to have to do that ourselves. We can use the os to create them for us.

    keysPath = r"Backend_Code\FrequencyGraphs\TagFrequencyMap\Community %s\tagsCommunity%sKeys.txt" %(communitySelected, communitySelected)
    valuesPath = r"Backend_Code\FrequencyGraphs\TagFrequencyMap\Community %s\tagsCommunity%sValues.txt" %(communitySelected, communitySelected)

    # 2. Iterate through nodes and add the new attribute
    # Let's say we're adding a 'status' attribute with the value 'active'
    counter = 0
    tagFrequencyMap = {} #A frequency map is how often a certain piece of data appears in a system. This is useful since we want to see the most common tags a community may have.
    for node_id in G.nodes():
        community = G.nodes[node_id]['communityID'] #Find the community

        if community == communitySelected:
            tags = G.nodes[node_id]['tags'] #Find the tags of the node that belongs to the community
            tags = literal_eval(tags)
            for tag in tags:
                if tag in tagFrequencyMap:
                    tagFrequencyMap[tag] += 1
                else:
                    tagFrequencyMap[tag] = 1

    outputKeysPathString = ""
    outputValuesPathString = ""

    for tag in tagFrequencyMap:
        outputKeysPathString += tag + "\n"
        outputValuesPathString += str(tagFrequencyMap[tag]) + "\n"

    with open(keysPath, "w", encoding="utf-8") as f:
        f.write(outputKeysPathString)
    with open(valuesPath, "w", encoding="utf-8") as f:
        f.write(outputValuesPathString)


    # 4. Save the file

    print(f"Community {communitySelected} completed.")

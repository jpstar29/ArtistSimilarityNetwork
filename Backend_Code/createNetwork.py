#Importing all our required libaries

import community.community_louvain as community
import random
import networkx as nx
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import datetime
import os

if not os.path.exists(r"Backend_Code\CSV_Files"):
    os.makedirs(r"Backend_Code\CSV_Files") #CSV_Files may not be a created folder. So we have to create it. This is included in the gitignore.
    raise RuntimeError("Please create a CSV file and put it in the folder Backend_Code\CSV_Files (created for you now) - CSV files can be automatically created in createDataset.py if it has a Last.fm API Key and personal email address")
filename = r'Backend Code\CSV_Files\artistSimilarities.csv'

def getRandomisedGraph(nodes, edgeConnections): #Just testing to see what the graph will do with hundreds of nodes
  G = nx.Graph() 
  attributes = {}

  for nodeCount in range(nodes):
    attributes[str(nodeCount)] = {"size": random.randint(7000000, 70000000)}
    G.add_node(str(nodeCount))

    for edgeCount in range(random.randint(0, edgeConnections - 1)):
      G.add_edge(str(nodeCount), str(random.randint(0, nodes - 1)))

  nx.set_node_attributes(G, attributes)
  return G

def getDataset(noOfRows):
  df = pd.read_csv(filename)
  df = df.head(10857) #This came from Backend_Code\Text Files\artistsCompletedAtDepth.txt. If the dataset didn't finish a layer (maybe it would take too much time) then to include all artists up to a finished layer, check how many artists are in the dataset at that layer by viewing this file.
  df = df.drop_duplicates(subset=['mbid'], keep="first")

  #We need to create multiple rows so that nx can handle nodes to different targets
  #For a real dataset of hundreds of thousnads of rows, it should still be fine but
  #It's important that each row has a unique id associated with the artist
  if noOfRows > 0:
    #If it isn't, just assume we want all of the rows
    if noOfRows < len(df):
      startPos = 0
      df = df[startPos: startPos + noOfRows]
  return df

def createGraph(df):

  G = nx.Graph() #Creating a graph with just the rows for the nodes we'll use
  for index, row in df.iterrows():
    if not (pd.isna(row['mbid']) or row['mbid'] == 'eec63d3c-3b81-4ad4-b1e4-7c147d4d2b61'):
      G.add_node(row['mbid'])
    if index % 5000 == 0:
      print("Next update! Reached %s nodes" %(index))
  #This code is pretty messy

  name_to_id = df.set_index('artist_name')['mbid'].to_dict()
  arist_nameList = df['artist_name'].tolist()

  edges = 0
  for index, row in df.iterrows():
    
    if edges % 5000 == 0:
      print("Next update! %s edges added, index is %s recorded at %s" %(edges, index, datetime.datetime.now()))
    try:
      artistStrengths = row['artistStrength']
      similarArtists = row['similarArtists']
      if len(artistStrengths) > 1:
        artistStrengths = artistStrengths.split(";")
        similarArtists = similarArtists.split(";")
      elif len(artistStrengths) == 1:
        artistStrengths = [artistStrengths] #Just converting the string into a list
        similarArtists = [similarArtists] 
    except TypeError:
      #Float object is not iterable - aka we have a Nan value and should be avoided
      continue
    for similar_artist in similarArtists:
      if similar_artist != '' and similar_artist in arist_nameList and not G.has_edge(row['mbid'], name_to_id[similar_artist]):
        try:
          G.add_edge(row['mbid'], name_to_id[similar_artist], weight = float(artistStrengths[similarArtists.index(similar_artist)])) #Make sure there isn't already an edge. And that the artist we're adding to does have a node.
        except IndexError:
          if len(artistStrengths) > len(similarArtists):
            raise #We are presuming that there are more similarArtists than artistStrengths. If not, then what happened?
          continue #We can't add an edge to another node if we don't have its strength.

        edges += 1
  
  # 1. Find all connected components and sort them by size
  components = sorted(nx.connected_components(G), key=len, reverse=True)

  # 2. Keep the largest component (index 0)
  mainComponent = components[0]

  # 3. Identify nodes NOT in the main component
  nodesToRemove = [n for n in G.nodes() if n not in mainComponent] #We don't need nodes that are completely isolated (it's likely they are connected to nodes that we just can't see in the dataset.)
  G.remove_nodes_from(nodesToRemove)

  attributesDict = df.set_index('mbid')[['listeners', 'artist_name']].to_dict('index') #Attributing the size
  nx.set_node_attributes(G, attributesDict)

  partition = community.best_partition(G) #Apparently this does all the clustering for me

  nx.set_node_attributes(G, partition, 'communityID')
  
  if not os.path.exists(r"Backend_Code\GEXF_Files"):
    os.makedirs(r"Backend_Code\GEXF_Files") #GEXF_Files may not be a created folder. So we have to create it. This is included in the gitignore.
  nx.write_gexf(G, "Backend_Code\GEXF_Files\artistsJS%s.gexf" %(G.number_of_nodes()))

  return G

def getFigure(G, noEdges): #No longer used but was created for Plotly

  pos = nx.spring_layout(G, k=0.8, iterations=200, scale = 50.0)

  partition = community.best_partition(G) #Apparently this does all the clustering for me?

  nx.set_node_attributes(G, partition, 'communityID')

  num_communities = max(partition.values()) + 1

  print(num_communities)
  count = 0
  for node in G.nodes():
    count += 1
  print(count)

  selected_cluster = range(15, 20)

  for node in G.nodes():
    if G.nodes[node]['communityID'] in selected_cluster:
      G.nodes[node]['highlight'] = True
      G.nodes[node]['listeners'] *= 1

  nodeX = []
  nodeY = []

  for node in G.nodes():
    nodeX.append(pos[node][0])
    nodeY.append(pos[node][1])

  edgeX = []
  edgeY = []

  # Iterate through all edges
  for edge in G.edges():
    x0, y0 = pos[edge[0]]  # Coordinates of the Source Node
    x1, y1 = pos[edge[1]]  # Coordinates of the Target Node

    edgeX.extend([x0, x1, None])
    edgeY.extend([y0, y1, None])

  dataGraph = []
  if not noEdges:
    edgeTrace = go.Scatter(
      x=edgeX, y=edgeY,
      line=dict(width=0.25, color='#888'),
      hoverinfo='none', # Edges usually don't need a hover pop-up
      mode='lines')
    dataGraph.append(edgeTrace)

  colorscaleNumber = random.randint(0, len(colorscales) - 1)

  nodeTrace = go.Scatter(x = nodeX, y=nodeY,
      mode='markers+text',
      hoverinfo='text',
      marker=dict(
          showscale=True,
          reversescale=True,
          colorscale='tealrose',
          color=[G.nodes[node]['communityID'] for node in G.nodes()],
          #size=[G.nodes[node]['listeners'] / 25000 for node in G.nodes()],
          size=10,
          line_width=2,

          colorbar=dict(
            title='Community Group',
            len=0.8, # Make the bar half the height of the plot
            x=1.02, # Position it slightly to the right
            thickness=10
        )))

  dataGraph.append(nodeTrace)

  # 3. Create the Figure
  fig = go.Figure(data = dataGraph,
              layout=go.Layout(
                  title='<br>Visualisation of Musical Artists',
                  showlegend=True,
                  hovermode='closest',
                  margin=dict(b=15,l=40,r=0,t=60),
                  annotations=[ dict(
                      text="Network analysis via NetworkX and Plotly",
                      showarrow=False,
                      xref="paper", yref="paper",
                      x=0.005, y=-0.002 ) ],
                  xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                  yaxis=dict(showgrid=False, zeroline=False, showticklabels=False))
                  )

  return fig

#G = getRandomisedGraph(50, 3)

df = getDataset(-1)
G = createGraph(df)

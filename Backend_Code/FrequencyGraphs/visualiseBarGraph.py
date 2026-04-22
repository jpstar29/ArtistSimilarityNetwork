import matplotlib.pyplot as plt
import pandas as pd

def generateGraph(communitySelected):
    keysPath = r"Backend_Code\FrequencyGraphs\TagFrequencyMap\Community %s\tagsCommunity%sKeys.txt" %(communitySelected, communitySelected)
    valuesPath = r"Backend_Code\FrequencyGraphs\TagFrequencyMap\Community %s\tagsCommunity%sValues.txt" %(communitySelected, communitySelected)

    with open(keysPath, "r", encoding="utf-8") as f:
        tags = f.read().split("\n")
        tags = tags[0:len(tags) - 1] #0 to len(counts) - 1 because the file has an empty line at the end.
    with open(valuesPath, "r", encoding="utf-8") as f:
        counts = f.read().split("\n")
        counts = [int(i) for i in counts[0:len(counts) - 1]] #Currently as strings, so let's make them integers. 0 to len(counts) - 1 because the file has an empty line at the end.

    # 2. Put it into a DataFrame
    
    df = pd.DataFrame({'Tags': tags, 'Count': counts})

    # Sorting ensures the highest frequency is at the top

    if "rnb" in df["Tags"].values: #The reason why we check if "rnb" is in the values initally is because this is ultimately the one we want to get rid of. If it's not there, we don't need to touch df really
        count = df.loc[df['Tags'] == "rnb", 'Count'].item()

        removeRows = ["r&b", "r and b", "R&B", "R and B", "Rnb"] #These all mean the same thing so it's best presented as one bar.
        for term in removeRows:
            if term in df["Tags"].values:
                count += df.loc[df['Tags'] == term, 'Count'].item()
                df = df[df['Tags'] != term] #Remove the tag now that we've added it's score to rnb

        df.loc[df['Tags'] == 'rnb', 'Count'] = count

    #Sort the dataframe

    df = df.sort_values(by='Count', ascending=True)
    df = df.tail(50)

    df['Tags'] = df['Tags'].replace({'rnb': 'r&b'}) #Makes it easier to read. rnb can look like mb with different fonts

    #Creating the chart
    #sns.set_theme(style="whitegrid") # One line to make everything look modern

    plt.figure(figsize=(6.5, 9.0))
    #plt.barh(df['Tags'], df['Count'])
    #plt.rcParams['font.sans-serif'] = 'Poppins' # Standard clean font

    # 3. Draw the bars with Google-style Blue
    bars = plt.barh(df['Tags'], df['Count'], color='#4285F4', edgecolor='none', height=0.7)

    # 4. Remove the outer box (Spines)
    plt.gca().spines['top'].set_visible(False)
    plt.gca().spines['right'].set_visible(False)
    plt.gca().spines['left'].set_color('#DDDDDD') # Light grey for remaining axes
    plt.gca().spines['bottom'].set_color('#DDDDDD')

    # 5. Add a light vertical grid (helps guide the eye)
    plt.gca().xaxis.grid(True, linestyle='--', alpha=0.3, color='#AAAAAA')
    plt.gca().set_axisbelow(True) # Ensure grid stays behind the bars

    # 6. Formatting Text
    plt.title(f'Community {communitySelected}: Frequency of Tags in Artists', fontsize=13, pad=20, weight='bold', color='#333333')
    plt.xlabel('Frequency', fontsize=12, labelpad=10, color='#666666')
    plt.yticks(fontsize=10, color='#444444')

    # 7. Add Value Labels (The "Google Sheets" touch)
    for bar in bars:
        width = bar.get_width()
        plt.text(width + 0.3, bar.get_y() + bar.get_height()/2, 
                f'{int(width)}', 
                va='center', fontsize=10, color='#444444') #How you can see the numbers next to each bar
    plt.tight_layout()
    plt.savefig("Backend_Code\FrequencyGraphs\FrequencyGraphImages\Community%s.png" %(communitySelected), dpi=300, bbox_inches='tight') #Bbox_inches crops the invisible white space around the graph
    plt.close()

for communitySelected in range(41):
    generateGraph(communitySelected)
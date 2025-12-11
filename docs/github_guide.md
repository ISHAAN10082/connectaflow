# How to Push to GitHub

This guide assumes you have this folder on your computer and want to get it onto GitHub.

## Step 1: Create the Repository on GitHub
1.  Log in to [GitHub](https://github.com).
2.  Click the **+** (plus icon) in the top right -> **New repository**.
3.  **Repository name**: `connectaflow`.
4.  **Public/Private**: Choose whatever you prefer.
5.  **IMPORTANT**: Do **NOT** check "Add a README file", "Add .gitignore", or "Choose a license". We already have these.
6.  Click **Create repository**.
7.  Keep the page open. You will see a section called "…or push an existing repository from the command line".

## Step 2: Connect Your Local Code

Open your terminal in the main `connectaflow` folder (where this `README.md` is).

1.  **Initialize Git** (starts tracking files):
    ```bash
    git init
    ```

2.  **Add All Files**:
    ```bash
    git add .
    ```

3.  **Save Your Work** (Commit):
    ```bash
    git commit -m "Initial cleanup and documentation"
    ```

4.  **Link to GitHub** (Remote):
    *   Go back to the GitHub page you left open.
    *   Copy the command that looks like: `git remote add origin ...`
    *   Paste it into your terminal and press Enter.
    *   *Example*:
        ```bash
        git remote add origin https://github.com/YOUR_USERNAME/connectaflow.git
        ```

5.  **Push to GitHub**:
    ```bash
    git push -u origin main
    ```

## Step 3: Success!
Refresh your GitHub page. You should see all your files there!

## Keeping it Updated
In the future, whenever you make changes:
1.  `git add .`
2.  `git commit -m "Description of changes"`
3.  `git push`
